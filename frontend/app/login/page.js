import AuthForm from '@/components/AuthForm';

export const metadata = { title: 'Entrar • Mural de Notas' };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
