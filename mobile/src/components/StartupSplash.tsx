import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Platform, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

type Props = {
  ready: boolean;
  onFinish: () => void;
};

/**
 * Preserve the original portrait artwork at screen size after the native launch
 * screen. Android's system splash is limited to a masked icon, not a full image.
 */
export function StartupSplash({ ready, onFinish }: Props) {
  const [imageReady, setImageReady] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!ready || !imageReady) return;
    let cancelled = false;
    const transition = Animated.timing(opacity, {
      toValue: 0,
      duration: 160,
      useNativeDriver: Platform.OS !== 'web',
    });

    const revealApp = async () => {
      // The root layout and local artwork are already drawable. No minimum wait.
      try { await SplashScreen.hideAsync(); } catch { /* No native splash on web / hot reload. */ }
      if (cancelled) return;
      transition.start(({ finished }) => {
        if (finished && !cancelled) onFinish();
      });
    };
    void revealApp();

    return () => {
      cancelled = true;
      transition.stop();
    };
  }, [ready, imageReady, opacity, onFinish]);

  return (
    <Animated.View
      style={[styles.overlay, { opacity }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <StatusBar style="light" />
      <Image
        source={require('../../assets/images/splash.png')}
        style={styles.artwork}
        resizeMode="contain"
        accessible={false}
        // onLoadEnd also fires on failure, so a damaged image cannot block startup.
        onLoadEnd={() => setImageReady(true)}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Cap the original portrait canvas on tablets and wide browser windows.
  artwork: { width: '100%', height: '100%', maxWidth: 480, maxHeight: 1065 },
});

