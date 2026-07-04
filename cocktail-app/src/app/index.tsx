import { Redirect } from 'expo-router';

export default function Index() {
  // Redirect instantly to the home page under the /(tabs) directory when the app starts
  return <Redirect href="/(tabs)"/>;
}