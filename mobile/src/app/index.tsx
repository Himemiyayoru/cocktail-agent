import { Redirect } from 'expo-router';

export default function Index() {
  // Force redirection to the primary library tab upon application launch
  return <Redirect href="/(tabs)/library" />;
}