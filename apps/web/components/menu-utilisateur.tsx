'use client';

import { CircleUserRound } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function MenuUtilisateur({
  nom,
  role,
  seDeconnecter,
}: {
  nom: string;
  role: string;
  seDeconnecter: () => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2">
          <CircleUserRound aria-hidden />
          <span className="hidden sm:inline">{nom}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p>{nom}</p>
          <p className="text-xs font-normal text-muted-foreground">{role}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/compte/mot-de-passe">Changer le mot de passe</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/compte/2fa">Vérification en deux étapes</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void seDeconnecter()}>Se déconnecter</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
