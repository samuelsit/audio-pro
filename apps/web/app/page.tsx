import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Accueil() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-4 py-16">
      <header className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">HA-Gestion</h1>
        <p className="text-muted-foreground">
          Gestion interne du réseau de centres d’audioprothèse.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Socle technique en place</CardTitle>
          <CardDescription>
            Les fonctionnalités arrivent étape par étape (voir docs/PLAN.md).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled>Se connecter (étape 1)</Button>
        </CardContent>
      </Card>
    </main>
  );
}
