import '../styles/globals.css'
import type { AppProps } from 'next/app'
import 'mapbox-gl/dist/mapbox-gl.css'

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
