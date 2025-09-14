import React from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ojphshzuosbfbftpoigy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qcGhzaHp1b3NiZmJmdHBvaWd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTQ1Mjc3MCwiZXhwIjoyMDY3MDI4NzcwfQ.ze3DvmYHGmDlOvBaE-SxCDaQwzAF6YoLsKjKPebXU4Q'
);

const LoginForm: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 p-8">
          {/* Logo et titre */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h1 className="text-2xl font-light text-white mb-2">Shape Eat Analytics</h1>
            <p className="text-slate-400 text-sm">Connectez-vous pour accéder au dashboard</p>
          </div>

          {/* Formulaire d'authentification */}
          <Auth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: '#10b981',
                    brandAccent: '#059669',
                    brandButtonText: 'white',
                    defaultButtonBackground: '#374151',
                    defaultButtonBackgroundHover: '#4b5563',
                    defaultButtonBorder: '#6b7280',
                    defaultButtonText: '#f9fafb',
                    dividerBackground: '#374151',
                    inputBackground: '#1f2937',
                    inputBorder: '#374151',
                    inputBorderHover: '#4b5563',
                    inputBorderFocus: '#10b981',
                    inputText: '#f9fafb',
                    inputLabelText: '#d1d5db',
                    inputPlaceholder: '#9ca3af',
                    messageText: '#f9fafb',
                    messageTextDanger: '#fca5a5',
                    anchorTextColor: '#10b981',
                    anchorTextHoverColor: '#059669',
                  },
                  space: {
                    spaceSmall: '4px',
                    spaceMedium: '8px',
                    spaceLarge: '16px',
                    labelBottomMargin: '8px',
                    anchorBottomMargin: '4px',
                    emailInputSpacing: '4px',
                    socialAuthSpacing: '4px',
                    buttonPadding: '10px 15px',
                    inputPadding: '10px 15px',
                  },
                  fontSizes: {
                    baseBodySize: '14px',
                    baseInputSize: '14px',
                    baseLabelSize: '14px',
                    baseButtonSize: '14px',
                  },
                  borders: {
                    buttonBorderRadius: '8px',
                    inputBorderRadius: '8px',
                  },
                }
              },
              className: {
                anchor: 'text-emerald-400 hover:text-emerald-300',
                button: 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 font-medium',
                container: 'space-y-4',
                divider: 'my-4',
                input: 'transition-all duration-200',
                label: 'font-medium',
                loader: 'text-emerald-500',
                message: 'text-sm',
              },
            }}
            providers={[]}
            redirectTo={window.location.origin}
            onlyThirdPartyProviders={false}
            magicLink={false}
            showLinks={true}
            localization={{
              variables: {
                sign_in: {
                  email_label: 'Email',
                  password_label: 'Mot de passe',
                  button_label: 'Se connecter',
                  loading_button_label: 'Connexion...',
                  link_text: 'Vous avez déjà un compte ? Connectez-vous',
                },
                sign_up: {
                  email_label: 'Email',
                  password_label: 'Mot de passe',
                  button_label: 'S\'inscrire',
                  loading_button_label: 'Inscription...',
                  link_text: 'Pas de compte ? Inscrivez-vous',
                },
                forgotten_password: {
                  email_label: 'Email',
                  button_label: 'Réinitialiser le mot de passe',
                  link_text: 'Mot de passe oublié ?',
                },
              },
            }}
          />
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-slate-500 text-sm">
            Accès réservé aux membres de l'équipe Shape Eat
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;