import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  ImageSourcePropType,
  StyleSheet,
  View,
} from 'react-native';

type OtterLoaderProps = {
  size?: number;
  duration?: number;
  source?: ImageSourcePropType;
};

export default function OtterLoader({
  size = 96,
  duration = 1000,
  source = require('@/assets/images/otterLoader.png'),
}: OtterLoaderProps) {
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    animation.start();

    return () => {
      animation.stop();
      spinValue.stopAnimation();
    };
  }, [duration, spinValue]);

  const rotate = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <Animated.Image
        source={source}
        style={{
          width: size,
          height: size,
          transform: [{ rotate }],
        }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});