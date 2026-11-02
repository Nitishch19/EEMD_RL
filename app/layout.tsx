import type { Metadata } from "next";
import IntroGate from "./IntroGate";
import "./globals.css";
export const metadata:Metadata={title:"EEMD-RL NCU Campus",description:"Interactive seasonal and safety-aware digital twin for whole-building academic energy management.",icons:{icon:"/favicon.ico",shortcut:"/favicon.ico"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body><IntroGate>{children}</IntroGate></body></html>}
