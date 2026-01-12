import "./globals.css";

export const metadata = {
  title: "Souq Syria",
  description: "Marketplace",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
