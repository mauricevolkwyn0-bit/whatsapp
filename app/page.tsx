

export default function Home() {
  return (
    // <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
      <div className="text-center text-gray-800">
        <h1 className="text-6xl font-bold mb-4">JUST WORK</h1>
        <p className="text-2xl mb-8">Get work done through WhatsApp Business API!</p>
        <a 
          href="https://wa.me/27730899949?text=Hi"
          className="bg-green-600 text-white px-8 py-4 rounded-lg text-xl hover:bg-green-700"
        >
          Start on WhatsApp →
        </a>
      </div>
    </main>
    // </div>
  );
}
