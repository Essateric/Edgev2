export default function Button({ children, onClick, type = "button", className = "", ...props }) {
  return (
    <button
      type={type}
      onClick={onClick}
      onSubmit={onClick}
      className={`btn ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
