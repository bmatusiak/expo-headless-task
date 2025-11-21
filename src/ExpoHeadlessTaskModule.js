import { requireNativeModule, EventEmitter as ExpoEventEmitter } from 'expo-modules-core';
import { Platform, PermissionsAndroid } from 'react-native';
const isAndroid = Platform.OS === 'android';
const NativeExpoHeadlessTaskModule = isAndroid ? requireNativeModule('ExpoHeadlessTask') : null;
let emitter = null;
if (NativeExpoHeadlessTaskModule) {
	emitter = new ExpoEventEmitter(NativeExpoHeadlessTaskModule);
}
import { AppRegistry } from 'react-native';

export default (function createExpoHeadlessTaskModule() {
	if (isAndroid) {
		console.log('[ExpoHeadlessTask] JS module loaded', NativeExpoHeadlessTaskModule.isTask() ? '(in task)' : '(in app)');
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

	function isTask() {
		if (!isAndroid) return false;
		return NativeExpoHeadlessTaskModule.isTask();
	}

	async function checkTask(timeoutMs = 1000) {
		if (!isAndroid) return false;
		try { return await NativeExpoHeadlessTaskModule.checkTask(timeoutMs); } catch (e) { return false; }
	}

	const loadedTasks = [];

	// IPC event handlers registry: eventName -> Set<handler>
	const ipcHandlers = new Map();

	function on(eventName, handler) {
		if (!isAndroid) return { remove() { } };
		if (!ipcHandlers.has(eventName)) ipcHandlers.set(eventName, new Set());
		ipcHandlers.get(eventName).add(handler);
		return {
			remove() {
				try { ipcHandlers.get(eventName)?.delete(handler); } catch (e) { }
			}
		};
	}

	function emit(eventName, data = {}) {
		if (!isAndroid) return;
		try { NativeExpoHeadlessTaskModule.emit(eventName, data); } catch (e) { }
	}

	// Subscribe to native IPC events once.
	if (emitter && !globalThis.__ExpoHeadlessTaskIPCSubscribed) {
		emitter.addListener('ipcEvent', ({ event, json }) => {
			try {
				const parsed = json ? JSON.parse(json) : {};
				const handlers = ipcHandlers.get(event);
				if (handlers) {
					for (const h of Array.from(handlers)) {
						try { h(parsed); } catch (e) { }
					}
				}
			} catch (e) { }
		});
		globalThis.__ExpoHeadlessTaskIPCSubscribed = true;
	}
	var __HEADLESSTASKCONTEXT = false; // retained for potential future diagnostic use

	// Register headless task once at module load to avoid duplicate registrations under fast refresh/StrictMode
	if (isAndroid && !globalThis.__HeadlessTaskRegistered) {
		AppRegistry.registerHeadlessTask('HEADLESS_TASK', () => async (data) => {
			__HEADLESSTASKCONTEXT = true;

			// Subscribe to messages sent from the app runtime
			await new Promise(r => setTimeout(r, 100));

			// Execute any loaded tasks in parallel
			await Promise.all(loadedTasks.map(taskFunc => {
				return (async () => {
					try {
						await taskFunc(data);
					} catch (e) {
					}
				})();
			}));

			try { stopForegroundTask(); } catch (e) { console.warn('Stop foreground task failed', e); }
		});
		globalThis.__HeadlessTaskRegistered = true;
	}

	var taskStarted = false;
	async function startTask(data, notification) {
		if (!isAndroid || taskStarted) return;
		await startForegroundTask({
			taskName: 'HEADLESS_TASK',
			data: data,
			notification: {
				channelId: 'headless_channel',
				channelName: 'Headless Task',
				title: 'Background work in progress',
				text: 'Working in background!',
				importance: 2,
				sticky: false,
				...notification,
			},
		});
		taskStarted = true;
	}
	function loadTask(taskFunc) {
		if (!isAndroid) return;
		loadedTasks.push(taskFunc);
	}


	function stopTask() {
		if (!isAndroid) return;
		// stopForegroundTask();
		emit('STOP_TASK');
		taskStarted = false;
	}

	const ExpoHeadlessTaskModule = {
		get __HEADLESSTASKCONTEXT() { return __HEADLESSTASKCONTEXT; },
		startTask,
		stopTask,
		loadTask,
		isTask,
		checkTask,
		isTaskString:NativeExpoHeadlessTaskModule.isTask() ? '(in task)' : '(in app)',
		ensureNotificationPermission,
		NativeExpoHeadlessTaskModule,
		on,
		emit,
	};

	globalThis.ExpoHeadlessTask = ExpoHeadlessTaskModule;

	return ExpoHeadlessTaskModule;
}());