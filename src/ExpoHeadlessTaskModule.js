import { requireNativeModule, EventEmitter } from 'expo-modules-core';
import { Platform, PermissionsAndroid } from 'react-native';
const isAndroid = Platform.OS === 'android';
const NativeExpoHeadlessTaskModule = isAndroid ? requireNativeModule('ExpoHeadlessTask') : null;
let emitter = null;
if (NativeExpoHeadlessTaskModule) {
	emitter = new EventEmitter(NativeExpoHeadlessTaskModule);
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
	sendToTask,
	sendFromTask,
	onMessageToTask,
	onMessageFromTask,
	NativeExpoHeadlessTaskModule,
};
