import React, { useEffect, useState } from 'react';
import { Button, Platform, StyleSheet, Text, View } from 'react-native';
import ExpoHeadlessTask from 'expo-headless-task';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Simplified demo: start/stop foreground headless task, display running state.
const isAndroid = Platform.OS === 'android';
globalThis.__TEST = 0;

if (isAndroid && !globalThis.__demoHeadlessTaskRegistered) {
  var runningTask = false;
  ExpoHeadlessTask.loadTask(async (data) => {
    if (runningTask) {
      console.log('[HeadlessTask] already running, exiting');
      return;
    }
    ExpoHeadlessTask.on('update_test_value', async () => {
      globalThis.__TEST += 1;
    });
    console.log('[HeadlessTask] started with data', data);
    runningTask = true;
    let i = 0;
    while (i < 6000) { // shorter loop for quicker demo
      await new Promise(r => setTimeout(r, 1000));
      const testValue = globalThis.__TEST || 0;
      console.log(`[HeadlessTask] running ${i + 1}s, TEST=${testValue}`);
      ExpoHeadlessTask.emit('taskProgress', { seconds: i + 1, testValue });
      i++;
    }
    console.log('[HeadlessTask] finished');
    runningTask = false;
    try { ExpoHeadlessTask.stopTask(); } catch (e) { console.warn('Stop foreground task failed', e); }
  });


  globalThis.__demoHeadlessTaskRegistered = true;
}

export function Demo() {

  const start = () => {
    ExpoHeadlessTask.startTask({ startedAt: Date.now() });
    console.log('[Demo] Headless task start requested');
  };
  const stop = () => {
    ExpoHeadlessTask.stopTask();
    console.log('[Demo] Headless task stop requested');
  };

  useEffect(() => {
    var interval = setInterval(() => {
      ExpoHeadlessTask.emit('update_test_value');
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const subscription = ExpoHeadlessTask.on('taskProgress', (data) => {
      console.log('[Demo] Headless task progress:', data);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  if (!isAndroid) return null;
  return (
    <View style={styles.controls}>
      <Text style={styles.controlsTitle}>Expo Headless Task</Text>
      <View style={styles.seperator} />
      <Text style={styles.sectionLabel}>Foreground Service + Headless JS</Text>
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