import { useEffect, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Image, ImageStyle } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { drinkImageUrl } from '../data/catalog';

type DrinkPhotoProps = {
  name: string;
  style?: StyleProp<ImageStyle>;
  preview?: boolean;
  iconColor?: string;
  iconSize?: number;
};

export function DrinkPhoto({ name, style, preview = true, iconColor = '#999', iconSize = 28 }: DrinkPhotoProps) {
  const full = drinkImageUrl(name);
  const preferred = full ? (preview ? `${full}/preview` : full) : null;
  const [uri, setUri] = useState<string | null>(preferred);

  useEffect(() => {
    setUri(preferred);
  }, [preferred]);

  if (!uri) {
    return (
      <View style={[style as StyleProp<ViewStyle>, { justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="wine-outline" size={iconSize} color={iconColor} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={`${name}:${uri}`}
      transition={120}
      onError={() => {
        if (full && uri !== full) setUri(full);
        else setUri(null);
      }}
    />
  );
}
