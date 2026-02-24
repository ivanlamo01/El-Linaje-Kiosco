import React from "react";

interface PaginationProps {
  productsPerPage: number;
  totalProducts: number;
  currentPage: number;
  paginate: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  productsPerPage,
  totalProducts,
  currentPage,
  paginate,
}) => {
  const totalPages = Math.ceil(totalProducts / productsPerPage);

  if (totalPages <= 1) return null;

  const previousPage = currentPage - 1;
  const nextPage = currentPage + 1;

  return (
    <nav className="flex justify-center mt-6">
      <ul className="flex items-center gap-2 bg-card border border-border px-4 py-2 rounded-xl shadow-sm">
        {/* Primera página */}
        <li>
          <button
            onClick={() => paginate(1)}
            disabled={currentPage === 1}
            className={`px-3 py-2 rounded-lg text-sm font-bold transition cursor-pointer ${currentPage === 1
              ? "text-muted-foreground cursor-not-allowed"
              : "text-primary hover:bg-primary/10"
              }`}
          >
            «
          </button>
        </li>

        {/* Página anterior */}
        {previousPage > 0 && (
          <li>
            <button
              onClick={() => paginate(previousPage)}
              className="px-3 py-2 rounded-lg text-sm font-bold text-muted-foreground hover:text-primary transition cursor-pointer"
            >
              {previousPage}
            </button>
          </li>
        )}

        {/* Página actual */}
        <li>
          <button
            onClick={() => paginate(currentPage)}
            className="px-3 py-2 rounded-lg text-sm font-bold bg-primary text-primary-foreground shadow-md cursor-default"
          >
            {currentPage}
          </button>
        </li>

        {/* Página siguiente */}
        {nextPage <= totalPages && (
          <li>
            <button
              onClick={() => paginate(nextPage)}
              className="px-3 py-2 rounded-lg text-sm font-bold text-muted-foreground hover:text-primary transition cursor-pointer"
            >
              {nextPage}
            </button>
          </li>
        )}

        {/* Última página */}
        <li>
          <button
            onClick={() => paginate(totalPages)}
            disabled={currentPage === totalPages}
            className={`px-3 py-2 rounded-lg text-sm font-bold transition cursor-pointer ${currentPage === totalPages
              ? "text-muted-foreground cursor-not-allowed"
              : "text-primary hover:bg-primary/10"
              }`}
          >
            »
          </button>
        </li>
      </ul>
    </nav>
  );
};

export default Pagination;
