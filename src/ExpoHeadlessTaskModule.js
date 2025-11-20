import { requireNativeModule, EventEmitter as ExpoEventEmitter } from 'expo-modules-core';
import { Platform, PermissionsAndroid } from 'react-native';
const isAndroid = Platform.OS === 'android';
const NativeExpoHeadlessTaskModule = isAndroid ? requireNativeModule('ExpoHeadlessTask') : null;
let emitter = null;
if (NativeExpoHeadlessTaskModule) {
	emitter = new ExpoEventEmitter(NativeExpoHeadlessTaskModule);
}
import { AppRegistry } from 'react-native';
import { EventEmitter as NodeEventEmitter } from 'events';
console.log("Loaded ExpoHeadlessTaskModule");
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
	if (!emitter) return { remove: () => { } };
	const sub = emitter.addListener('messageToTask', (event) => {
		try { listener(event?.data); } catch (_) { }
	});
	return { remove: () => sub.remove() };
}

function onMessageFromTask(listener) {
	if (!emitter) return { remove: () => { } };
	const sub = emitter.addListener('messageFromTask', (event) => {
		try { listener(event?.data); } catch (_) { }
	});
	return { remove: () => sub.remove() };
}

const loadedTasks = [];
var __HEADLESSTASKCONTEXT = false;
var taskEventEmitter = new NodeEventEmitter();

// Register headless task once at module load to avoid duplicate warnings under StrictMode/fast refresh
if (isAndroid && !globalThis.__HeadlessTaskRegistered) {
	AppRegistry.registerHeadlessTask('HEADLESS_TASK', () => async (data) => {
		console.log("WTF", globalThis.WYTF);
		__HEADLESSTASKCONTEXT = true;

		// Subscribe to messages sent from the app runtime
		const toTaskSub = onMessageToTask((data) => {
			if (!__HEADLESSTASKCONTEXT) return;
			taskEventEmitter.emit(data.name, ...data.args);
		});
		//short wait before starting tasks
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

		try { toTaskSub.remove(); } catch (_e) { }
		try { stopForegroundTask(); } catch (e) { console.warn('Stop foreground task failed', e); }
	});
	globalThis.__HeadlessTaskRegistered = true;
}

var taskStarted = false;
async function startTask(data, notification) {
	if (!isAndroid || taskStarted) return;
	const fromTaskSub = onMessageFromTask((data) => {
		if (__HEADLESSTASKCONTEXT) return;
		console.log('Message from task received', data);
		taskEventEmitter.emit(data.name, ...data.args);
	});
	globalThis.WYTF = true;
	const task = await startForegroundTask({
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
	return () => {
		try { fromTaskSub.remove(); } catch (_e) { }
		try { task.remove(); } catch (_e) { }
		taskStarted = false;
	};
}
function loadTask(taskFunc) {
	if (!isAndroid) return;
	loadedTasks.push(taskFunc);
}

function onMessage(name, listener) {
	taskEventEmitter.on(name, listener);
	return () => {
		taskEventEmitter.off(name, listener);
	}
}
function emitMessage(name, ...args) {
	if (!isAndroid) return;
	// if (__HEADLESSTASKCONTEXT)
		sendToTask({ name, args });
	// else
	// 	sendFromTask({ name, args });
	// // else
}

function stopTask() {
	if (!isAndroid) return;
	stopForegroundTask();
	taskStarted = false;
}

export default {
	// startForegroundTask,
	// stopForegroundTask,
	get __HEADLESSTASKCONTEXT() { return __HEADLESSTASKCONTEXT; },
	startTask,
	stopTask,
	loadTask,
	isTaskRunning,
	onTaskRunningChanged,
	ensureNotificationPermission,
	on: onMessage,
	emit: emitMessage,
	// sendToTask,
	// sendFromTask,
	// onMessageToTask,
	// onMessageFromTask,
	NativeExpoHeadlessTaskModule,
};
