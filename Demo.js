import React, { useEffect, useState } from 'react';
import {
  Button,
  Platform,
  StyleSheet,
  Text,
  View,
  ScrollView,
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
    let i = 0; 
    while (i < 5) {
      await new Promise(r => setTimeout(r, 1000));
      console.log('[HeadlessTask] tick', i);
      i++;
    }
    console.log('[HeadlessTask] finished');
    try { ExpoHeadlessTask.stopForegroundTask(); } catch (e) { console.warn('Stop foreground task failed', e); }
  });
  global.__demoHeadlessTaskRegistered = true;
}

export function Demo() {
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!isAndroid) return;
    const sub = ExpoHeadlessTask.onTaskRunningChanged(({ running }) => setRunning(running));
    return () => sub.remove();
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

  return (
    <ScrollView contentContainerStyle={styles.controls} keyboardShouldPersistTaps="handled">
      <Text style={styles.controlsTitle}>Expo Headless Task</Text>
      <View style={styles.seperator} />
      <Text style={styles.sectionLabel}>Foreground Service + Headless JS</Text>
      <Text style={styles.text}>Running: {String(running)}</Text>
      <View style={styles.button}>
        <Button title="Start Task" onPress={start} />
      </View>
      <View style={styles.button}>
        <Button title="Stop Task" onPress={stop} />
      </View>
    </ScrollView>
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
    color: '#666',
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