export const metadata = {
  title: 'BaseLinker Orders Feed',
  description: 'Orders API feed from BaseLinker',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
