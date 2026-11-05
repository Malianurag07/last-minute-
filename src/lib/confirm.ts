import { Alert, Platform } from 'react-native';

/** Ask before doing something that can't be undone. */
export function confirm(title: string, msg: string, onYes: () => void, yes = 'Yes') {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${msg}`)) onYes();
    return;
  }
  Alert.alert(title, msg, [
    { text: 'No, go back', style: 'cancel' },
    { text: yes, style: 'destructive', onPress: onYes },
  ]);
}
