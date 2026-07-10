import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Snag',
  description: 'Catch the moments your app trips users up.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
