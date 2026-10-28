import { Caveat, Inter } from 'next/font/google';
import { ToastProvider } from '@/components/Toasts';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-ui' });
const caveat = Caveat({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-hand' });

export const metadata = {
  title: 'Mural de Notas',
  description: 'Bloco de notas online com post-its animados, pastas, busca, clima e lembretes de datas.',
  applicationName: 'Mural de Notas',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${caveat.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
