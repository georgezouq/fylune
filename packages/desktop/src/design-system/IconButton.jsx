import { forwardRef } from "react";

export const IconButton = forwardRef(function IconButton({
  label,
  title = label,
  className = "",
  type = "button",
  children,
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={`icon-button ${className}`.trim()}
      aria-label={label}
      title={title}
      {...props}
    >
      {children}
    </button>
  );
});
