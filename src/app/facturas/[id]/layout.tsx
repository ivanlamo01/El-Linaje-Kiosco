export function generateStaticParams() {
    return [{ id: 'ver' }];
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
