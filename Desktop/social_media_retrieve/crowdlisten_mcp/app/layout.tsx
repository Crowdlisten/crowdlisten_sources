// Next.js root layout
export const metadata = {
  title: 'CrowdListen MCP Server',
  description: 'Social media content analysis with engagement-weighted opinion clustering',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}