"use client";
import { useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  // Refs for smooth scrolling
  const homeRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLDivElement>(null);

  const scrollToSection = (ref: any) => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="font-sans">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 w-full bg-white shadow-md z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between p-4 md:p-6">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => scrollToSection(homeRef)}>
            {/* Logo Placeholder */}
          
               <Image
            src="/logo1.png"
            alt="PASAHI Logo"
            width={100} height={100} // or "cover" depending on how you want it to fit
          />
           
           
          </div>
          <div className="hidden md:flex items-center gap-6">
            <button className="text-gray-700 hover:text-gray-900 transition" onClick={() => scrollToSection(homeRef)}>Home</button>
            <button className="text-gray-700 hover:text-gray-900 transition" onClick={() => scrollToSection(aboutRef)}>About</button>
            <button className="text-gray-700 hover:text-gray-900 transition" onClick={() => scrollToSection(stepsRef)}>How it Works</button>
            <button className="text-gray-700 hover:text-gray-900 transition" onClick={() => scrollToSection(contactRef)}>Contact</button>
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition font-medium"
              onClick={() => router.push("/create-room")}
            >
              Transfer Files
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section ref={homeRef} className="min-h-screen flex flex-col justify-center items-center bg-gray-50 pt-20 px-4 text-center md:text-left md:px-20">
        <h1 className="text-4xl md:text-6xl font-bold text-gray-800 mb-4">Fast & Secure File Transfers</h1>
        <p className="text-gray-600 text-lg text-center md:text-xl max-w-2xl mb-6">
          Transfer files instantly with minimal setup. No accounts needed, just create a drop zone and start sharing.
        </p>
        <div className="flex gap-4 flex-col sm:flex-row justify-center">
          <button
            onClick={() => router.push("/create-room")}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium"
          >
            Transfer Files
          </button>
          <button
            onClick={() => scrollToSection(aboutRef)}
            className="border border-gray-300 px-6 py-3 text-gray-500 rounded-lg hover:bg-gray-100 transition font-medium"
          >
            Learn More
          </button>
        </div>
        {/* Placeholder for hero image */}
        <div className="mt-20 w-full max-w-xl h-20  rounded-xl relative">
          <Image
            src="/logo1.png"
            alt="PASAHI Logo"
            fill
            style={{ objectFit: "contain" }} // or "cover" depending on how you want it to fit
          />
        </div>
      </section>

      {/* About Section */}
      <section ref={aboutRef} className="py-20 px-4 md:px-20 bg-white">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-6 text-center md:text-left">About the App</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            <p className="text-gray-600 text-lg">
              Our app allows you to transfer files seamlessly between peers without creating an account. It's secure, fast, and simple.
            </p>
            <p className="text-gray-600 text-lg">
              Perfect for teams, friends, or personal use. You just create a drop zone, share the code, and start transferring files immediately.
            </p>
          </div>
          {/* Placeholder for about image */}
          <div className="w-full h-120  rounded-xl relative">
            <Image
            src="/image2.png"
            alt="image1"
           fill
            style={{ objectFit: "contain" }} // or "cover" depending on how you want it to fit
          />
          </div>
        </div>
      </section>

      {/* Steps / How it Works */}
      <section ref={stepsRef} className="py-20 px-4 md:px-20 bg-gray-50">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-12 text-center">How it Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <div className="bg-white rounded-2xl shadow-md p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full mx-auto flex items-center justify-center text-blue-600 font-bold text-xl">1</div>
            <h3 className="font-semibold text-gray-800">Create a drop zone</h3>
            <p className="text-gray-600">Generate a unique drop zone code to start a secure session for file sharing.</p>
          </div>
          <div className="bg-white rounded-2xl shadow-md p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-purple-100 rounded-full mx-auto flex items-center justify-center text-purple-600 font-bold text-xl">2</div>
            <h3 className="font-semibold text-gray-800">Share the Code</h3>
            <p className="text-gray-600">Send the drop zone code to your peer so they can join and start transferring files.</p>
          </div>
          <div className="bg-white rounded-2xl shadow-md p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full mx-auto flex items-center justify-center text-green-600 font-bold text-xl">3</div>
            <h3 className="font-semibold text-gray-800">Transfer Files</h3>
            <p className="text-gray-600">Upload and download files instantly with real-time progress updates.</p>
          </div>
        </div>
      </section>

      

      {/* Footer */}
      <footer className="py-6 text-center bg-gray-50 text-gray-500">
        &copy; {new Date().getFullYear()} FileTransferApp. All rights reserved.
      </footer>
    </div>
  );
}
