import { Redirect } from 'expo-router';

import { useStore } from '../state/store';

export default function Index() {
  const { role, me } = useStore();
  if (role === 'customer') return <Redirect href="/c" />;
  if (role === 'provider') return <Redirect href={me ? '/p' : '/join'} />;
  return <Redirect href="/welcome" />;
}
