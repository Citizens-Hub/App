import { Link } from "react-router";

export default function BackgroundVideo() {
  return (
    <div className='fixed top-[65px] left-0 w-full h-[calc(100vh-65px)] overflow-hidden pointer-events-none'>
      <video className='w-full h-full object-cover blur-sm scale-105 grayscale-80 opacity-80' src="/videos/bg.mp4" autoPlay muted loop playsInline />
      <p className="absolute bottom-5 left-5 text-md opacity-80 text-gray-50 drop-shadow-lg pointer-events-auto">
        Video by「<Link to="https://www.bilibili.com/video/BV1JHEAz6E16" target="_blank" className="decoration-none !text-sky-100"> -SMrP- </Link>」
      </p>
    </div>
  )
}