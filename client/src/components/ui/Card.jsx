export function Card({ children, className = '', padding = true }) {
  return (
    <div
      className={`rounded-xl border border-[#E8E8E5] bg-white dark:border-[#26282D] dark:bg-[#17181B] shadow-[0_1px_2px_rgba(23,23,23,0.03)] ${
        padding ? 'p-4 sm:p-5' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export default Card;
