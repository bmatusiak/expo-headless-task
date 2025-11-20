import { requireNativeModule, EventEmitter as ExpoEventEmitter } from 'expo-modules-core';
import { Platform, PermissionsAndroid } from 'react-native';
const isAndroid = Platform.OS === 'android';
const NativeExpoHeadlessTaskModule = isAndroid ? requireNativeModule('ExpoHeadlessTask') : null;
let emitter = null;
if (NativeExpoHeadlessTaskModule) { 
	emitter = new ExpoEventEmitter(NativeExpoHeadlessTaskModule);
}
import { AppRegistry } from 'react-native';
console.log('[ExpoHeadlessTask] JS module loaded');
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
	if (!emitter) return { remove: () => { } };
	const subscription = emitter.addListener('taskRunningChanged', listener);
	return { remove: () => subscription.remove() };
}

const loadedTasks = [];
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
	stopForegroundTask();
	taskStarted = false;
}

export default {
	get __HEADLESSTASKCONTEXT() { return __HEADLESSTASKCONTEXT; },
	startTask,
	stopTask,
	loadTask,
	isTaskRunning,
	onTaskRunningChanged,
	ensureNotificationPermission,
	NativeExpoHeadlessTaskModule,
};
