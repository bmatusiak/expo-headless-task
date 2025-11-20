import React, { useEffect, useState } from 'react';
import { Button, Platform, StyleSheet, Text, View } from 'react-native';
import ExpoHeadlessTask from 'expo-headless-task';

// Simplified demo: start/stop foreground headless task, display running state.
const isAndroid = Platform.OS === 'android';

if (isAndroid && !globalThis.__demoHeadlessTaskRegistered) {
  ExpoHeadlessTask.loadTask(async (data) => {
    console.log('[HeadlessTask] started with data', data);
    let i = 0;
    while (i < 10) { // shorter loop for quicker demo
      await new Promise(r => setTimeout(r, 1000));
      console.log('[HeadlessTask] tick', i);
      i++;
    }
    console.log('[HeadlessTask] finished');
    try { ExpoHeadlessTask.stopTask(); } catch (e) { console.warn('Stop foreground task failed', e); }
  });
  globalThis.__demoHeadlessTaskRegistered = true;
}

export function Demo() {
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!isAndroid) return;
    const runningSub = ExpoHeadlessTask.onTaskRunningChanged(({ running }) => setRunning(running));
    return () => { runningSub.remove(); };
  }, []);

  if (!isAndroid) return null;

  const start = () => {
    ExpoHeadlessTask.startTask({ startedAt: Date.now() });
    console.log('[Demo] Headless task start requested');
  };
  const stop = () => {
    ExpoHeadlessTask.stopTask();
    console.log('[Demo] Headless task stop requested');
  };

  return (
    <View style={styles.controls}>
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


//-- END DEMO --/

export default { Demo };