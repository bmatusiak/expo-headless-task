import { requireNativeModule, EventEmitter } from 'expo-modules-core';
import { Platform, PermissionsAndroid } from 'react-native';
const isAndroid = Platform.OS === 'android';
const NativeExpoHeadlessTaskModule = isAndroid ? requireNativeModule('ExpoHeadlessTask') : null;
let emitter = null;
if (NativeExpoHeadlessTaskModule) {
	emitter = new EventEmitter(NativeExpoHeadlessTaskModule);
}

// Cross-runtime event bridge
const BRIDGE_EVENT_TYPE = 'expo-headless-bridge-event';

function createListenerMap() {
	const map = new Map();
	return {
		add(event, fn) {
			let set = map.get(event);
			if (!set) { set = new Set(); map.set(event, set); }
			set.add(fn);
			return () => { set.delete(fn); if (set.size === 0) map.delete(event); };
		},
		get(event) { return map.get(event) || new Set(); },
		clear() { map.clear(); },
	};
}

function createMainBridgeEmitter({ channel = 'default' } = {}) {
	const listeners = createListenerMap();
	const inbound = onMessageFromTask((data) => {
		try {
			if (!data || data.type !== BRIDGE_EVENT_TYPE) return;
			if (data.channel !== channel) return;
			for (const fn of listeners.get(data.event)) {
				try { fn(...(Array.isArray(data.args) ? data.args : [data.args])); } catch (_) {}
			}
		} catch (_) {}
	});

	return {
		emit(event, ...args) {
			// Send to headless task
			return sendToTask({ type: BRIDGE_EVENT_TYPE, channel, event, args });
		},
		on(event, handler) {
			return { remove: listeners.add(event, handler) };
		},
		off(event, handler) {
			// Best-effort: re-add and immediately remove specific handler
			const remove = listeners.add(event, handler);
			remove();
		},
		removeAllListeners() { listeners.clear(); },
		dispose() { inbound.remove?.(); listeners.clear(); },
	};
}

function createHeadlessBridgeEmitter({ channel = 'default' } = {}) {
	const listeners = createListenerMap();
	const inbound = onMessageToTask((data) => {
		try {
			if (!data || data.type !== BRIDGE_EVENT_TYPE) return;
			if (data.channel !== channel) return;
			for (const fn of listeners.get(data.event)) {
				try { fn(...(Array.isArray(data.args) ? data.args : [data.args])); } catch (_) {}
			}
		} catch (_) {}
	});

	return {
		emit(event, ...args) {
			// Send to main runtime
			return sendFromTask({ type: BRIDGE_EVENT_TYPE, channel, event, args });
		},
		on(event, handler) {
			return { remove: listeners.add(event, handler) };
		},
		off(event, handler) {
			const remove = listeners.add(event, handler);
			remove();
		},
		removeAllListeners() { listeners.clear(); },
		dispose() { inbound.remove?.(); listeners.clear(); },
	};
}

function createBridgeEmitter(options = {}) {
	const side = options?.side || 'main'; // 'main' | 'headless'
	const channel = options?.channel || 'default';
	return side === 'headless'
		? createHeadlessBridgeEmitter({ channel })
		: createMainBridgeEmitter({ channel });
}

async function ensureNotificationPermission() {
	if (!isAndroid) return true;
	if (Platform.Version < 33) return true; // POST_NOTIFICATIONS starts API 33
	const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
	if (granted) return true;
	const request = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
	return request === PermissionsAndroid.RESULTS.GRANTED;
}

async function startForegroundTask({ taskName, data = {}, notification = {} }) {
	if (!isAndroid) return;
	const ok = await ensureNotificationPermission();
	if (!ok) {
		console.warn('[ExpoHeadlessTask] Notification permission denied; foreground notification may not appear.');
	}
	return NativeExpoHeadlessTaskModule.startForegroundTask(taskName, data, notification);
}

function stopForegroundTask() {
	if (!isAndroid) return;
	return NativeExpoHeadlessTaskModule.stopForegroundTask();
}

function isTaskRunning() {
	if (!isAndroid) return false;
	return NativeExpoHeadlessTaskModule.isTaskRunning();
}

function onTaskRunningChanged(listener) {
	if (!emitter) return { remove: () => {} };
	const subscription = emitter.addListener('taskRunningChanged', listener);
	return { remove: () => subscription.remove() };
}

// Cross-runtime messaging helpers
function sendToTask(data = {}) {
	if (!isAndroid) return;
	try { return NativeExpoHeadlessTaskModule.sendToTask(data); } catch (e) { console.warn('[ExpoHeadlessTask] sendToTask failed', e); }
}

function sendFromTask(data = {}) {
	if (!isAndroid) return;
	try { return NativeExpoHeadlessTaskModule.sendFromTask(data); } catch (e) { console.warn('[ExpoHeadlessTask] sendFromTask failed', e); }
}

function onMessageToTask(listener) {
	if (!emitter) return { remove: () => {} };
	const sub = emitter.addListener('messageToTask', (event) => {
		try { listener(event?.data); } catch (_) {}
	});
	return { remove: () => sub.remove() };
}

function onMessageFromTask(listener) {
	if (!emitter) return { remove: () => {} };
	const sub = emitter.addListener('messageFromTask', (event) => {
		try { listener(event?.data); } catch (_) {}
	});
	return { remove: () => sub.remove() };
}

export default {
	startForegroundTask,
	stopForegroundTask,
	isTaskRunning,
	onTaskRunningChanged,
	ensureNotificationPermission,
	createMainBridgeEmitter,
	createHeadlessBridgeEmitter,
	createBridgeEmitter,
	NativeExpoHeadlessTaskModule,
};
