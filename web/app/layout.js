import './globals.css'
import Header from '../components/Header'
import Footer from '../components/Footer'
import Head from "next/head"

// export const runtime = "edge"

export const metadata = {
  title: 'OXO',
  description: 'oxo bulletin website'
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" >
      <Head>
        <title>
          {metadata.meta_title}
        </title>
        <meta name="description" content={metadata.description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <body className="container mx-auto bg-emerald-500 dark:bg-green-800">
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  )
}