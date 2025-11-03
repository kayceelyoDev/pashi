# Pasahi - Peer-to-Peer File Sharing

Pasahi is a modern, secure peer-to-peer file sharing web application that allows users to share files directly between browsers without uploading to a central server. Share files of any size with anyone, anywhere, using a simple room code.

## Features

- **True Peer-to-Peer Transfer** - Files are transferred directly between users using WebRTC technology
- **No File Size Limits** - Share files of any size without server storage constraints
- **Secure Connections** - End-to-end encrypted file transfers
- **Simple Sharing** - Share files using easy-to-remember room codes
- **Copy & Share** - Quickly copy room links and codes to share with others
- **Dark Mode Support** - Built-in theme switcher for comfortable viewing
- **Real-time Status** - See connection status and transfer progress in real-time
- **No Account Required** - Start sharing files immediately without registration

## Tech Stack

- **[Next.js 15](https://nextjs.org/)** - React framework with App Router and Turbopack
- **[React 19](https://react.dev/)** - UI library
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe development
- **[Supabase](https://supabase.com/)** - Backend as a Service for signaling and room management
- **[WebRTC](https://webrtc.org/)** - Peer-to-peer communication protocol
- **[Socket.IO](https://socket.io/)** - Real-time bidirectional event-based communication
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[Lucide React](https://lucide.dev/)** - Beautiful icon library
- **[next-themes](https://github.com/pacocoursey/next-themes)** - Theme management

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm, yarn, pnpm, or bun
- Supabase account (for backend services)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd pasahi
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

3. Set up environment variables:
Create a `.env.local` file in the root directory and add your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## How It Works

1. **Create a Room** - The sender creates a new room and receives a unique room code
2. **Share the Code** - Share the room code or link with the recipient
3. **Join the Room** - The recipient enters the room code to join
4. **Connect** - A peer-to-peer connection is established using WebRTC
5. **Transfer Files** - Files are transferred directly between browsers without server storage

## Project Structure

```
pasahi/
├── app/
│   ├── api/              # API routes
│   ├── create-room/      # Room creation page
│   ├── join-room/        # Room joining page
│   ├── room/             # Active room/transfer page
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Home page
│   └── globals.css       # Global styles
├── components/           # Reusable React components
├── lib/                  # Utility functions and configurations
├── public/              # Static assets
└── package.json         # Project dependencies
```

## Key Technologies Explained

### WebRTC
WebRTC (Web Real-Time Communication) enables direct peer-to-peer data transfer between browsers without requiring an intermediary server. This ensures:
- Fast transfer speeds (limited only by network bandwidth)
- Enhanced privacy (files don't pass through a server)
- No storage costs

### Supabase
Supabase is used for:
- Room management and coordination
- WebRTC signaling (exchanging connection information)
- User presence and connection state

### Socket.IO
Handles real-time communication for:
- Room status updates
- Connection establishment
- Transfer progress notifications

## Building for Production

```bash
npm run build
# or
yarn build
# or
pnpm build
# or
bun build
```

Then start the production server:

```bash
npm run start
# or
yarn start
# or
pnpm start
# or
bun start
```

## Deploy on Vercel

The easiest way to deploy Pasahi is to use the [Vercel Platform](https://vercel.com/new):

1. Push your code to a Git repository
2. Import your repository to Vercel
3. Add your environment variables
4. Deploy!

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Powered by [Supabase](https://supabase.com/)
- Icons by [Lucide](https://lucide.dev/)

---

Made with ❤️ for easy and secure file sharing
