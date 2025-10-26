"use client";
import { useRef, useState, useEffect } from "react";
import { Upload, Shield, Zap, ArrowRight, Menu, X, Check, Share2, Lock, Sparkles, Heart, Star, Send } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [displayedReviews, setDisplayedReviews] = useState<Array<{ name: string; rating: number; review: string }>>([]);

  const homeRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLDivElement>(null);

  // Real Filipino names and genuine reviews
  const reviewsData = [
    { name: "Miguel Santos", rating: 5, review: "PASAHI made file sharing so easy! No more email attachments or complicated cloud storage setups." },
    { name: "Sofia Reyes", rating: 5, review: "Fast, secure, and incredibly simple. This is exactly what I needed for quick file transfers!" },
    { name: "Carlos Mendoza", rating: 4, review: "Great service! Works perfectly for sharing large files with my team." },
    { name: "Isabella Garcia", rating: 5, review: "I love how I don't need to create an account. Just share the code and transfer files instantly!" },
    { name: "Rafael Cruz", rating: 5, review: "The speed is incredible! Transferred 2GB in just minutes. Highly recommend!" },
    { name: "Luna Fernandez", rating: 4, review: "Very convenient for quick file sharing. The interface is clean and easy to use." },
    { name: "Diego Torres", rating: 5, review: "Best file transfer tool I've used. Simple, fast, and secure. Perfect for work!" },
    { name: "Gabriela Ramos", rating: 5, review: "No sign-up required is a game changer. I can share files with clients instantly!" },
    { name: "Antonio Lopez", rating: 4, review: "Excellent tool for sharing large video files. Much better than other services." },
    { name: "Valentina Morales", rating: 5, review: "Super easy to use! Shared a 1GB presentation with my team in seconds." },
    { name: "Lucas Diaz", rating: 5, review: "The security features give me peace of mind. Great for sensitive documents!" },
    { name: "Camila Herrera", rating: 4, review: "Clean interface and fast transfers. Exactly what I was looking for!" },
    { name: "Mateo Rivera", rating: 5, review: "Finally, a file sharing service that just works! No hassle, no complications." },
    { name: "Emma Castillo", rating: 5, review: "I use this daily for work. Reliable, fast, and secure. Couldn't ask for more!" },
    { name: "Sebastian Flores", rating: 4, review: "Great for quick file sharing. The room code system is genius!" },
    { name: "Olivia Gomez", rating: 5, review: "Perfect for collaboration! My team loves how easy it is to share files." },
    { name: "Daniel Martinez", rating: 5, review: "No more file size limits! This is perfect for sharing large design files." },
    { name: "Mia Rodriguez", rating: 4, review: "Simple and effective. Does exactly what it promises without any fuss." },
    { name: "Adrian Perez", rating: 5, review: "The best part? No registration! Just create a room and start sharing." },
    { name: "Zoe Silva", rating: 5, review: "Fast, secure, and user-friendly. This is now my go-to file sharing tool!" }
  ];

  useEffect(() => {
    const shuffled = [...reviewsData].sort(() => 0.5 - Math.random());
    setDisplayedReviews(shuffled.slice(0, 3));
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (ref: any) => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
    setIsMenuOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!rating || !name.trim() || !message.trim()) {
      return;
    }

    setIsSubmitting(true);

    // Simulate sending (you'll add database logic here later)
    await new Promise(resolve => setTimeout(resolve, 2000));

    setIsSubmitted(true);
    setIsSubmitting(false);

    // Reset form after 3 seconds
    setTimeout(() => {
      setRating(0);
      setName("");
      setMessage("");
      setIsSubmitted(false);
    }, 3000);
  };

  return (
    <div className="font-sans bg-white">
      {/* Navbar */}
      <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
        scrolled ? "bg-white shadow-sm" : "bg-white"
      }`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between p-4 md:px-8 md:py-5">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => scrollToSection(homeRef)}>
            <Image
              src="/logo1.png"
              alt="PASAHI Logo"
              width={100}
              height={100}
              className="object-contain transform group-hover:scale-105 transition-transform duration-200"
            />
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            <button className="text-gray-600 hover:text-black transition font-medium" onClick={() => scrollToSection(homeRef)}>
              Home
            </button>
            <button className="text-gray-600 hover:text-black transition font-medium" onClick={() => scrollToSection(aboutRef)}>
              About
            </button>
            <button className="text-gray-600 hover:text-black transition font-medium" onClick={() => scrollToSection(stepsRef)}>
              How it Works
            </button>
            <button className="text-gray-600 hover:text-black transition font-medium" onClick={() => scrollToSection(contactRef)}>
              Contact
            </button>
            <Link href={"/create-room"}
              className="bg-black text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 transition-all duration-200 font-medium"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-200">
            <div className="flex flex-col p-4 space-y-3">
              <button className="text-left py-2 text-gray-600 hover:text-black transition font-medium" onClick={() => scrollToSection(homeRef)}>
                Home
              </button>
              <button className="text-left py-2 text-gray-600 hover:text-black transition font-medium" onClick={() => scrollToSection(aboutRef)}>
                About
              </button>
              <button className="text-left py-2 text-gray-600 hover:text-black transition font-medium" onClick={() => scrollToSection(stepsRef)}>
                How it Works
              </button>
              <button className="text-left py-2 text-gray-600 hover:text-black transition font-medium" onClick={() => scrollToSection(contactRef)}>
                Contact
              </button>
              <Link href={"/create-room"}
                className="bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition font-medium mt-2 text-center"
              >
                Get Started
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section ref={homeRef} className="min-h-screen flex flex-col justify-center items-center bg-white pt-24 pb-20 px-4">
        <div className="max-w-6xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-black text-white px-4 py-2 rounded-full text-sm font-medium mb-8">
            <Sparkles className="w-4 h-4" />
            No Account Required
          </div>

          <h1 className="text-5xl md:text-7xl font-light text-black mb-6 leading-tight tracking-tight">
            Fast & Secure
            <br />
            <span className="text-gray-600">
              File Transfers
            </span>
          </h1>

          <p className="text-gray-600 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Transfer files instantly with minimal setup. No accounts needed, just create a room and start sharing securely.
          </p>

          <div className="flex gap-4 flex-col sm:flex-row justify-center items-center mb-16">
            <Link href={"/create-room"}
              className="group bg-black text-white px-8 py-4 rounded-lg hover:bg-gray-800 transition-all duration-200 font-medium flex items-center gap-2"
            >
              Start Transferring
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <button
              onClick={() => scrollToSection(aboutRef)}
              className="border border-gray-300 px-8 py-4 text-black rounded-lg hover:bg-gray-50 transition-all duration-200 font-medium"
            >
              Learn More
            </button>
          </div>

          {/* Feature Pills */}
          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <div className="flex items-center gap-2 bg-gray-50 px-5 py-3 rounded-full border border-gray-200">
              <Shield className="w-5 h-5 text-black" />
              <span className="text-sm font-medium text-gray-700">End-to-End Encrypted</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-50 px-5 py-3 rounded-full border border-gray-200">
              <Zap className="w-5 h-5 text-black" />
              <span className="text-sm font-medium text-gray-700">Lightning Fast</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-50 px-5 py-3 rounded-full border border-gray-200">
              <Lock className="w-5 h-5 text-black" />
              <span className="text-sm font-medium text-gray-700">Private & Secure</span>
            </div>
          </div>

          {/* Hero Image/Mockup */}
          <div className="relative max-w-4xl mx-auto">
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200">
              <div className="bg-white rounded-xl p-12">
                <div className="flex items-center justify-center relative w-full h-64">
                  <Image
                    src="/logo1.png"
                    alt="PASAHI"
                    fill
                    style={{ objectFit: "contain" }}
                    className="opacity-80"
                  />
                </div>
              </div>
            </div>
            {/* Floating elements */}
            <div className="absolute -top-6 -right-6 bg-black text-white p-4 rounded-xl">
              <Check className="w-8 h-8" />
            </div>
            <div className="absolute -bottom-6 -left-6 bg-gray-800 text-white p-4 rounded-xl">
              <Share2 className="w-8 h-8" />
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section ref={aboutRef} className="py-24 px-4 md:px-20 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-light text-black mb-4 tracking-tight">
              Why Choose PASAHI?
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              The simplest way to share files securely without the hassle of accounts or complicated setups.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-white rounded-lg flex items-center justify-center border border-gray-200">
                  <Shield className="w-6 h-6 text-black" />
                </div>
                <div>
                  <h3 className="text-xl font-medium text-black mb-2">Secure & Private</h3>
                  <p className="text-gray-600">
                    End-to-end encryption ensures your files remain private and secure during transfer.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-white rounded-lg flex items-center justify-center border border-gray-200">
                  <Zap className="w-6 h-6 text-black" />
                </div>
                <div>
                  <h3 className="text-xl font-medium text-black mb-2">Lightning Fast</h3>
                  <p className="text-gray-600">
                    Transfer files at maximum speed with real-time progress tracking and instant notifications.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-white rounded-lg flex items-center justify-center border border-gray-200">
                  <Upload className="w-6 h-6 text-black" />
                </div>
                <div>
                  <h3 className="text-xl font-medium text-black mb-2">No Account Needed</h3>
                  <p className="text-gray-600">
                    Start sharing immediately without sign-ups, logins, or any personal information.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="bg-white rounded-2xl p-8 border border-gray-200">
                <div className="bg-gray-50 rounded-xl p-12 flex items-center justify-center">
                  <div className="relative w-full h-96">
                    <Image
                      src="/image2.png"
                      alt="About PASAHI"
                      fill
                      style={{ objectFit: "contain" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section ref={stepsRef} className="py-24 px-4 md:px-20 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-light text-black mb-4 tracking-tight">
              How It Works
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              Three simple steps to start sharing files securely with anyone, anywhere.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="relative group">
              <div className="bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all duration-300 p-8 h-full border border-gray-200">
                <div className="w-16 h-16 bg-black rounded-xl mx-auto mb-6 flex items-center justify-center text-white font-medium text-2xl group-hover:scale-110 transition-transform duration-300">
                  1
                </div>
                <h3 className="font-medium text-xl text-black mb-4 text-center">Create Room</h3>
                <p className="text-gray-600 text-center leading-relaxed">
                  Generate a unique room code instantly. No setup required, just click and you're ready to go.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative group">
              <div className="bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all duration-300 p-8 h-full border border-gray-200">
                <div className="w-16 h-16 bg-gray-700 rounded-xl mx-auto mb-6 flex items-center justify-center text-white font-medium text-2xl group-hover:scale-110 transition-transform duration-300">
                  2
                </div>
                <h3 className="font-medium text-xl text-black mb-4 text-center">Share the Code</h3>
                <p className="text-gray-600 text-center leading-relaxed">
                  Send the room code to anyone. They can join instantly and securely connect with you.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative group">
              <div className="bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all duration-300 p-8 h-full border border-gray-200">
                <div className="w-16 h-16 bg-gray-500 rounded-xl mx-auto mb-6 flex items-center justify-center text-white font-medium text-2xl group-hover:scale-110 transition-transform duration-300">
                  3
                </div>
                <h3 className="font-medium text-xl text-black mb-4 text-center">Transfer Files</h3>
                <p className="text-gray-600 text-center leading-relaxed">
                  Upload and download files with real-time progress. Fast, secure, and hassle-free.
                </p>
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <div className="text-center mt-16">
            <Link href={"/create-room"}
              className="group bg-black text-white px-10 py-5 rounded-lg hover:bg-gray-800 transition-all duration-200 font-medium text-lg inline-flex items-center gap-3"
            >
              Try It Now
              <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* Contact/CTA Section */}
      <section ref={contactRef} className="py-24 px-4 md:px-20 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-light text-black mb-4 tracking-tight">
              Contact Us
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              We'd love to hear from you. Share your feedback or reach out with any questions.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Left Side - Map and Info */}
            <div className="space-y-8">
              {/* Map */}
              <div className="relative w-full h-96 bg-gray-100 rounded-2xl overflow-hidden border border-gray-200">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d251447.95763864846!2d123.6255845!3d10.3156992!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33a999258ddc5d95%3A0x2b0ff8dd6b3e9b8e!2sCebu%20City%2C%20Cebu%2C%20Philippines!5e0!3m2!1sen!2s!4v1234567890"
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="grayscale"
                ></iframe>
                <div className="absolute top-4 left-4 bg-white px-4 py-2 rounded-lg shadow-lg border border-gray-200">
                  <p className="text-sm font-medium text-black flex items-center gap-2">
                    <span className="w-2 h-2 bg-black rounded-full"></span>
                    Cebu, Philippines
                  </p>
                </div>
              </div>

              {/* Reviews Section */}
              <div className="space-y-4">
                <h3 className="text-xl font-medium text-black mb-4">What Our Users Say</h3>
                
                {displayedReviews.map((review, index) => (
                  <div key={index} className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      {[...Array(5)].map((_, i) => (
                        <svg 
                          key={i} 
                          className={`w-5 h-5 ${i < review.rating ? 'fill-black' : 'fill-gray-300'}`} 
                          viewBox="0 0 20 20"
                        >
                          <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                        </svg>
                      ))}
                    </div>
                    <p className="text-gray-700 mb-3">
                      "{review.review}"
                    </p>
                    <p className="text-sm font-medium text-black">— {review.name}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Side - Feedback Form */}
            <div className="bg-gray-50 p-8 rounded-2xl border border-gray-200">
              <h3 className="text-2xl font-medium text-black mb-6">Send Us Your Feedback</h3>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Rating */}
                <div>
                  <label className="block text-sm font-medium text-black mb-3">
                    Rate Your Experience
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(0)}
                        className="transition-transform hover:scale-110"
                      >
                        <Star
                          className={`w-8 h-8 ${
                            star <= (hoveredRating || rating)
                              ? "fill-black stroke-black"
                              : "fill-none stroke-gray-300"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-black mb-3">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all"
                    required
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium text-black mb-3">
                    Your Feedback
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Share your thoughts with us..."
                    rows={5}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all resize-none"
                    required
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting || isSubmitted || !rating}
                  className="w-full bg-black text-white py-4 rounded-lg hover:bg-gray-800 transition-all duration-200 font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-black"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Sending...
                    </>
                  ) : isSubmitted ? (
                    <>
                      <Check className="w-5 h-5" />
                      Sent Successfully!
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Submit Feedback
                    </>
                  )}
                </button>

                {isSubmitted && (
                  <div className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                    <p className="text-sm text-center text-gray-700">
                      Thank you for your feedback! We appreciate your time.
                    </p>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 text-center bg-gray-900 text-gray-400">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center mb-6">
            <div className="relative w-16 h-16">
              <Image
                src="/logo1.png"
                alt="PASAHI Logo"
                fill
                style={{ objectFit: "contain" }}
              />
            </div>
          </div>
          <p className="text-sm mb-2">
            &copy; {new Date().getFullYear()} PASAHI. All rights reserved.
          </p>
          <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
            Made with <Heart className="w-3 h-3 fill-current" /> by kayceelyo_dev
          </p>
        </div>
      </footer>
    </div>
  );
}