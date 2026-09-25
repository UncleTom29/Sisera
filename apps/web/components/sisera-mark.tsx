export function SiseraMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" role="img" aria-label="Sisera">
      <path
        d="M35.5 10.5C31.7 6.9 25.5 6.4 20.9 8.6c-5.2 2.5-7.7 8.4-5.2 12.3 2.3 3.5 7.6 3.9 12.2 5.4 4.6 1.5 7.1 3.4 6.8 7-.4 4.4-5.2 7.3-10.9 7.3-4.5 0-8.3-1.5-11-4.4"
        stroke="#E9BD8C"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path d="M8 24h7.3M32.7 24H40" stroke="#78B9AD" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="40" cy="24" r="2.2" fill="#78B9AD" />
    </svg>
  );
}
