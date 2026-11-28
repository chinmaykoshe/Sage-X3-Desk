export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  type = 'button',
  ...props
}) {
  const variants = {
    primary:
      'bg-[#171717] text-white hover:bg-[#2a2a2a] border-transparent dark:bg-[#C6F36B] dark:text-[#171717] dark:hover:bg-[#b8ea55] shadow-sm',
    accent:
      'bg-[#C6F36B] text-[#171717] hover:bg-[#b8ea55] border-[#b4df5a] font-semibold shadow-sm',
    secondary:
      'bg-white text-[#171717] border-[#E8E8E5] hover:bg-[#F4F4F2] dark:bg-[#1A1B1E] dark:text-slate-200 dark:border-[#2C2E33] dark:hover:bg-[#25262B]',
    danger: 'bg-[#F16D64] text-white hover:bg-[#e15950] border-transparent shadow-sm',
    ghost:
      'bg-transparent text-[#555555] hover:bg-[#E8E8E5]/60 hover:text-[#171717] dark:text-slate-300 dark:hover:bg-white/10 border-transparent',
    success: 'bg-[#35B8A6] text-white hover:bg-[#2da393] border-transparent shadow-sm',
  };

  const sizes = {
    xs: 'px-2.5 py-1 text-xs',
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-3.5 py-2 text-xs',
    lg: 'px-4 py-2.5 text-sm',
  };

  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#C6F36B]/60 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
