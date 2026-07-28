import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { LoginForm } from '@/components/LoginForm';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/');

  return (
    <main className="page">
      <h1>Log in</h1>
      <LoginForm />
    </main>
  );
}
