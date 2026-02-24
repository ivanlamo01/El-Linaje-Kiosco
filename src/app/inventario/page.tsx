import Tabla from "../Components/tabla";

function Inventario() {
  return (
    <div className="min-h-screen bg-background text-foreground p-6 lg:p-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 border-b border-border pb-4">
          <h1 className="text-4xl font-bold text-primary tracking-tight">Inventario General</h1>
          <p className="text-muted-foreground mt-2">Gestiona tus productos y categorías</p>
        </div>
        <Tabla />
      </div>
    </div>
  );
}

export default Inventario;
