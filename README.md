# Expo Headless Task Module

Android-only Expo module providing a simple bridge for starting/stopping a foreground Service that runs a React Native Headless JS task. Useful for lightweight periodic work, short background loops, or continuing processing when the UI is minimized. The foreground notification is clickable and will bring your app to the foreground.

## Features
- Start a foreground service tied to a registered Headless JS task.
- Automatic Android 13+ (API 33) notification permission request.
- Observable running state via event listener (`onTaskRunningChanged`).
- Simple API surface (start, stop, query running state).
- No-op on non-Android platforms (safe cross‑platform imports).

## When To Use
Use this module when you need a brief burst of background execution (e.g., syncing, processing a small queue) that should continue if the app is backgrounded. It is not intended for long‑lived, battery‑intensive tasks.

## Installation
In the monorepo this module is already linked. If published separately:
```bash
expo install expo-headless-task
```
(Adjust to actual package name if changed.)

Rebuild the app after native changes:
```bash
npx expo run:android
```
For JS-only edits, just reload the dev client:
```bash
npm run start --dev-client
```

## Registering a Headless Task
You must register the task *once*, ideally at module load—not inside components—to avoid duplicate registrations under fast refresh or StrictMode.
```js
import { AppRegistry, Platform } from 'react-native';
import ExpoHeadlessTask from 'expo-headless-task';

const TASK_NAME = 'DemoForegroundTask';

if (Platform.OS === 'android' && !global.__demoHeadlessTaskRegistered) {
  AppRegistry.registerHeadlessTask(TASK_NAME, () => async (data) => {
    console.log('[HeadlessTask] started with data', data);
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 1000));
      console.log('[HeadlessTask] tick', i);
    }
    console.log('[HeadlessTask] finished');
    ExpoHeadlessTask.stopForegroundTask(); // finish service
  });
  global.__demoHeadlessTaskRegistered = true;
}
```

## Quick Start in a Component
```js
import ExpoHeadlessTask from 'expo-headless-task';

function startTask() {
  ExpoHeadlessTask.startForegroundTask({
    taskName: 'DemoForegroundTask',
    data: { startedAt: Date.now() },
    notification: {
      channelId: 'demo_headless_channel',
      channelName: 'Demo Headless Task',
      title: 'Working…',
      text: 'Background task running',
      importance: 2, // Android importance level
    },
  });
}

function stopTask() {
  ExpoHeadlessTask.stopForegroundTask();
}
```

## API Reference
### `startForegroundTask({ taskName, data?, notification? })`
Starts the foreground service and invokes the registered headless task by name.
- `taskName` (string): Must match `AppRegistry.registerHeadlessTask` name.
- `data` (object): Arbitrary JSON-serializable data passed to the task.
- `notification` (object): Foreground service notification config (see below). Permission for `POST_NOTIFICATIONS` requested automatically on API 33+.
Returns: `Promise<any>` from native module.

### `stopForegroundTask()`
Stops the foreground service (and associated headless task if still running). Safe to call multiple times.

### `isTaskRunning()`
Returns a boolean indicating current running state (Android only; `false` elsewhere).

### `onTaskRunningChanged(listener)`
Subscribes to native event broadcasting `{ running: boolean }` changes. Returns `{ remove() }` subscription handle.
```js
const sub = ExpoHeadlessTask.onTaskRunningChanged(({ running }) => console.log('Running:', running));
// later
sub.remove();
```

### `ensureNotificationPermission()`
Utility that checks/requests Android 13+ notification permission. Called internally by `startForegroundTask`—usually you do not need to call this manually.

### `NativeExpoHeadlessTaskModule`
Underlying native module reference (internal; avoid direct usage unless extending functionality).

## Notification Object Schema
Foreground service requires a visible notification (Android policy). Tapping the notification brings your app to the foreground. Keys:
- `channelId` (string): Notification channel ID (created if missing).
- `channelName` (string): Human-readable channel name.
- `title` (string): Notification title.
- `text` (string): Notification body text.
- `importance` (number): Android importance level (e.g., 2 = `IMPORTANCE_DEFAULT`).
Additional keys may be supported natively in future—keep schema minimal for now.

## Events
- `taskRunningChanged`: Emitted when running state changes; payload `{ running: boolean }`.

## Permissions
- Android 13+ (API 33): `POST_NOTIFICATIONS` runtime permission. Automatically requested by `startForegroundTask()` via `ensureNotificationPermission()`.
- Earlier Android versions: No runtime notification permission; service notification appears automatically.

## Platform Behavior
- Android: Full functionality.
- Non-Android (iOS, web): All calls are safe no-ops; `isTaskRunning()` returns `false`.

## Development Workflow (Monorepo)
1. JS changes (`Demo.js`, module JS): `npm run start --dev-client`.
2. Native changes (Kotlin/Manifest/etc.): `npx expo run:android`.
3. If build cache issues: run module clean script if provided, then rebuild.

## Demo
See `Demo.js` in this module for a working integration, including task registration and simple loop logging.

## Best Practices
- Always stop the foreground task when work completes to avoid a lingering notification.
- Keep headless task duration short—Android may enforce stricter policies on long-running foreground services.
- Debounce start calls: avoid repeatedly starting a task if one is still active.
- Register the task only once (use a global flag to avoid duplicates under fast refresh).

## Extending
To add new events or configuration:
1. Update native Kotlin module to emit events / accept params.
2. Expose a JS wrapper method guarded with `Platform.OS === 'android'`.
3. Document new options here.

## Troubleshooting
- Task never starts: Confirm `taskName` matches registration string.
- No notification on Android 13+: Ensure user granted notification permission (check device settings).
- Event listener not firing: Verify subscription and confirm native side sends `taskRunningChanged` transitions.

## Limitations
- Not designed for indefinite background execution or high-frequency timers.
- Requires a foreground notification for compliance; cannot run silently.

## License
(Insert license info here if applicable.)

---
Feel free to extend this README with additional native implementation details as the module evolves.
