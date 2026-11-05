import { Redirect } from 'expo-router';

import { useStore } from '../state/store';

export default function Index() {
  const { user, role, me } = useStore();
  if (!user) return <Redirect href="/welcome" />;
  if (role === 'provider') return <Redirect href={me ? '/p' : '/join'} />;
  return <Redirect href="/c" />;
}
