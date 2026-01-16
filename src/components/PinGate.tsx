import { useState } from 'react';
import { usePinGate } from '@/hooks/usePinGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock } from 'lucide-react';

interface PinGateProps {
  children: React.ReactNode;
}

export function PinGate({ children }: PinGateProps) {
  const { isVerified, pinRequired, loading, verifyPin } = usePinGate();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  if (isVerified) {
    return <>{children}</>;
  }

  if (!pinRequired) {
    return <>{children}</>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setVerifying(true);

    const valid = await verifyPin(pin);
    
    if (!valid) {
      setError('Code PIN incorrect');
      setPin('');
    }
    setVerifying(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">Accès protégé</h1>
          <p className="text-muted-foreground mt-2">Entrez votre code PIN pour continuer</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="Code PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="text-center text-2xl tracking-widest"
            autoFocus
          />
          
          {error && (
            <p className="text-destructive text-sm text-center">{error}</p>
          )}

          <Button 
            type="submit" 
            className="w-full"
            disabled={!pin || verifying}
          >
            {verifying ? 'Vérification...' : 'Accéder'}
          </Button>
        </form>
      </div>
    </div>
  );
}
