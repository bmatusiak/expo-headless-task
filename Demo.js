import React, { useEffect, useState } from 'react';
import {
  Button,
  Platform,
  StyleSheet,
  Text,
  View
} from 'react-native';

// Import the Expo ported module
import ExpoHeadlessTask from 'expo-headless-task';
import { AppRegistry } from 'react-native';

//-- START DEMO for expo-headless-task --/

const isAndroid = Platform.OS === 'android';

// Register headless task once at module load to avoid duplicate warnings under StrictMode/fast refresh
if (isAndroid && !global.__demoHeadlessTaskRegistered) {
  AppRegistry.registerHeadlessTask('DemoForegroundTask', () => async (data) => {
    console.log('[HeadlessTask] started with data', data);
    // Bridge-based messaging between headless and main
    const bridge = ExpoHeadlessTask.createBridgeEmitter({ side: 'headless', channel: 'demo' });
    const toTaskSub = bridge.on('ping', (msg) => {
      console.log('[HeadlessTask] received ping', msg);
      try { bridge.emit('pong', { ack: true, received: msg, at: Date.now() }); } catch (e) { console.warn('[HeadlessTask] emit pong failed', e); }
    });
    let i = 0;
    while (i < 60) {
      await new Promise(r => setTimeout(r, 1000));
      console.log('[HeadlessTask] tick', i);
      i++;
    }
    console.log('[HeadlessTask] finished');
    try { toTaskSub.remove(); } catch (_e) {}
    try { bridge.dispose(); } catch (_e) {}
    try { ExpoHeadlessTask.stopForegroundTask(); } catch (e) { console.warn('Stop foreground task failed', e); }
  });
  global.__demoHeadlessTaskRegistered = true;
}

export function Demo() {
  const [running, setRunning] = useState(false);
  const [messagesFromTask, setMessagesFromTask] = useState([]);
  const [lastSent, setLastSent] = useState(null);

  useEffect(() => {
    if (!isAndroid) return;
    const runningSub = ExpoHeadlessTask.onTaskRunningChanged(({ running }) => setRunning(running));
    const bridge = ExpoHeadlessTask.createBridgeEmitter({ side: 'main', channel: 'demo' });
    const fromTaskSub = bridge.on('pong', (data) => {
      setMessagesFromTask(prev => [...prev, data]);
    });
    return () => {
      runningSub.remove();
      fromTaskSub.remove();
      bridge.dispose();
    };
  }, []);

  if (!isAndroid) return null;

  const start = () => {
    ExpoHeadlessTask.startForegroundTask({
      taskName: 'DemoForegroundTask',
      data: { startedAt: Date.now(), payload: 'hello' },
      notification: {
        channelId: 'demo_headless_channel',
        channelName: 'Demo Headless Task',
        title: 'Background work in progress',
        text: 'Tap to keep app responsive',
        importance: 2,
      },
    });
  };

  const stop = () => {
    ExpoHeadlessTask.stopForegroundTask();
  };

  const toggle = () => {
    if (running) {
      stop();
    } else {
      start();
    }
  };

  const sendPing = () => {
    const payload = { type: 'ping', ts: Date.now(), seq: (lastSent?.seq || 0) + 1 };
    setLastSent(payload);
    try {
      const bridge = ExpoHeadlessTask.createBridgeEmitter({ side: 'main', channel: 'demo' });
      // Fire-and-forget emit; we create a transient emitter for this send
      bridge.emit('ping', payload);
      bridge.dispose();
    } catch (e) {
      console.warn('Bridge emit failed', e);
    }
  };

  return (
    <View style={styles.controls}>
      <Text style={styles.controlsTitle}>Expo Headless Task</Text>
      <View style={styles.seperator} />
      <Text style={styles.sectionLabel}>Foreground Service + Headless JS</Text>
      <Text style={styles.text}>Running: {String(running)}</Text>
      <View style={styles.button}>
        <Button title={running ? 'Stop Task' : 'Start Task'} onPress={toggle} />
      </View>
      <View style={styles.button}>
        <Button title="Send Ping" onPress={sendPing} disabled={!running} />
      </View>
      <Text style={styles.sectionLabel}>Messaging</Text>
      <Text style={styles.text}>Last Sent: {lastSent ? JSON.stringify(lastSent) : 'None'}</Text>
      <Text style={styles.text}>Received ({messagesFromTask.length}):</Text>
      {messagesFromTask.slice(-5).map((m, idx) => (
        <Text key={idx} style={styles.text}>• {JSON.stringify(m)}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    gap: 12,
  },
  controlsTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 8,
    color: '#333',
  },
  button: {
    marginTop: 4,
    marginBottom: 4,
  },
  text: {
    fontSize: 12,
    color: '#444',
  },
  seperator: {
    height: 1,
    backgroundColor: 'lightgray',
    marginVertical: 10, // Adds spacing above and below the line
  },
});


//-- END DEMO for react-native-persistent-bubble --/

// ** add more demos if needed ** //

export default { Demo };