export function Avatar({ name = 'User', color = '#2563eb', size = 'sm' }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');

  const sizes = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-7 w-7 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-12 w-12 text-base',
  };

  return (
    <span
      style={{ backgroundColor: color || '#2563eb' }}
      title={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none ${sizes[size]}`}
    >
      {initials || 'U'}
    </span>
  );
}

export default Avatar;
