# expo-headless-task

Android-only Expo module to start/stop a foreground Service that runs a React Native Headless JS task, with a tiny cross-runtime event bridge between the main JS runtime and the headless task. Ideal for short background work that should continue when the UI is minimized.

## Features
- Start a foreground service tied to a registered Headless JS task
- Auto-requests Android 13+ (API 33) notification permission
- Observe running state via `onTaskRunningChanged`
- Simple bridge emitter for bi-directional messaging (main ↔ headless)
- Safe no-ops on non-Android platforms

## Installation
If consuming as a package:
```bash
expo install expo-headless-task
```

Rebuild after native changes:
```bash
npx expo run:android
```

For JS-only edits, reload the dev client:
```bash
npm run start --dev-client
```

## Quick Start

### 1) Register a Headless Task (once)
Register at module load to avoid duplicate registrations under fast refresh/StrictMode.
```js
import { AppRegistry, Platform } from 'react-native';
import ExpoHeadlessTask from 'expo-headless-task';

const TASK_NAME = 'DemoForegroundTask';

if (Platform.OS === 'android' && !global.__demoHeadlessTaskRegistered) {
  AppRegistry.registerHeadlessTask(TASK_NAME, () => async (data) => {
    console.log('[HeadlessTask] started with data', data);
    // Your background work here…
    console.log('[HeadlessTask] finished');
    ExpoHeadlessTask.stopForegroundTask();
  });
  global.__demoHeadlessTaskRegistered = true;
}
```

### 2) Start/Stop from the app
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
      importance: 2,
    },
  });
}

function stopTask() {
  ExpoHeadlessTask.stopForegroundTask();
}
```

## Bridge Messaging (main ↔ headless)
Use a channelled bridge emitter to send events between the main runtime and the headless task.

Notes:
- `channel` namespaces messages (default `'default'`).
- Payloads must be JSON-serializable.
- Android-only; no-ops elsewhere.

Main runtime:
```js
import ExpoHeadlessTask from 'expo-headless-task';

const bridge = ExpoHeadlessTask.createBridgeEmitter({ side: 'main', channel: 'demo' });

// Listen to replies from headless
const sub = bridge.on('pong', (payload) => {
  console.log('From task:', payload);
});

// Send a message to headless
bridge.emit('ping', { ts: Date.now() });

// Cleanup
sub.remove();
bridge.dispose();
```

Headless task:
```js
import ExpoHeadlessTask from 'expo-headless-task';

export default async function taskMain() {
  const bridge = ExpoHeadlessTask.createBridgeEmitter({ side: 'headless', channel: 'demo' });

  const sub = bridge.on('ping', (payload) => {
    console.log('From main:', payload);
    bridge.emit('pong', { ack: true, at: Date.now(), received: payload });
  });

  // …perform work, then cleanup
  sub.remove();
  bridge.dispose();
}
```

## API Reference

### `startForegroundTask({ taskName, data?, notification? })`
Start the foreground service and invoke the registered headless task.
- `taskName`: string, must match the name passed to `AppRegistry.registerHeadlessTask`.
- `data`: object, JSON-serializable payload delivered to the task.
- `notification`: object, see Notification schema.
Notes: On Android 13+, notification permission is requested automatically.

### `stopForegroundTask()`
Stop the foreground service and end the task if still running.

### `isTaskRunning()`
Return a boolean indicating if the task is currently running.

### `onTaskRunningChanged(listener)`
Subscribe to `{ running: boolean }` changes. Returns `{ remove() }`.

### `ensureNotificationPermission()`
Check/request Android 13+ notification permission. Usually not needed; called by `startForegroundTask`.

### `createBridgeEmitter({ side, channel? })`
Create an event bridge for cross-runtime messaging.
- `side`: `'main' | 'headless'`.
- `channel`: optional string namespace (default `'default'`).
Returns an object with:
- `emit(event: string, ...args: any[])`
- `on(event: string, handler: (...args) => void): { remove(): void }`
- `off(event, handler)` (best-effort)
- `removeAllListeners()`
- `dispose()`

## Notification Schema
Foreground services require a visible notification:
- `channelId`: string
- `channelName`: string
- `title`: string
- `text`: string
- `importance`: number (e.g., 2 = default)

## Platform & Permissions
- Android: Full support.
- Android 13+: `POST_NOTIFICATIONS` runtime permission is requested automatically.
- Non-Android (iOS/web): All methods are safe no-ops; `isTaskRunning()` returns `false`.

## Demo
See `Demo.js` for a complete example: task registration, start/stop controls, and a ping/pong bridge on channel `'demo'`.

## Development (Monorepo)
1. JS changes (`Demo.js`, module JS): `npm run start --dev-client`
2. Native changes (Kotlin/Manifest/etc.): `npx expo run:android`
3. If build cache issues: clean the module and rebuild

## Troubleshooting
- Task never starts: Ensure `taskName` matches registration.
- No notification on Android 13+: Check permission in device settings.
- No bridge messages: Verify both sides use the same `channel` and the correct `side`.

## Limitations
- Designed for short tasks; long-running background work may be restricted by Android policies.
- Requires a foreground notification; cannot run silently in background.

## License
MIT (or your chosen license).
