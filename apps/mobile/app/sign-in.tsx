import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { ArrowRight, Mail } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

function generateStrongPassword(): string {
  // 24 chars across classes Clerk typically accepts. Users never enter
  // this — they re-authenticate via email OTP — so it exists purely to
  // satisfy the sign-up's password requirement in one shot.
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let out = '';
  for (let i = 0; i < 24; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * Email-OTP sign-in + unified sign-up flow.
 *
 * Unified: we first try to sign in with the email. If Clerk says the
 * account doesn't exist (no identifier found), we transparently create
 * one and send a verification code instead. Same two-step UX either way,
 * so the user never has to choose "sign in vs sign up."
 */
export default function SignInScreen() {
  const router = useRouter();
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = signInLoaded && signUpLoaded && !busy;

  async function handleSendCode() {
    if (!signIn || !signUp) return;
    setError(null);
    setBusy(true);
    try {
      // Try sign-in first.
      const attempt = await signIn.create({
        identifier: email.trim().toLowerCase(),
      });
      const emailFactor = attempt.supportedFirstFactors?.find(
        (f: any) => f.strategy === 'email_code',
      ) as any;
      if (!emailFactor) {
        throw new Error('Email code strategy not available for this account.');
      }
      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: emailFactor.emailAddressId,
      });
      setMode('signIn');
      setStep('code');
    } catch (e: any) {
      // If the account doesn't exist, transparently fall through to sign-up.
      const code = e?.errors?.[0]?.code;
      if (code === 'form_identifier_not_found') {
        try {
          await signUp.create({ emailAddress: email.trim().toLowerCase() });
          await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
          setMode('signUp');
          setStep('code');
        } catch (e2: any) {
          setError(e2?.errors?.[0]?.message ?? 'Could not send verification code.');
        }
      } else {
        setError(e?.errors?.[0]?.message ?? 'Could not send verification code.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode() {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signIn' && signIn) {
        const result = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code: code.trim(),
        });
        if (result.status === 'complete') {
          await setSignInActive?.({ session: result.createdSessionId });
          router.replace('/');
          return;
        }
        console.warn('[sign-in] unexpected signIn status', result.status);
      } else if (mode === 'signUp' && signUp) {
        let result: any = await signUp.attemptEmailAddressVerification({
          code: code.trim(),
        });

        // Common case with default Clerk instances: sign-up needs a password
        // or a name before it can activate. Auto-fill with a random password
        // (the user will always come back via email OTP, so they never need
        // to remember it) and an email-derived name.
        if (result.status === 'missing_requirements') {
          const updates: Record<string, string> = {};
          const missing: string[] = result.missingFields ?? [];
          if (missing.includes('password')) {
            updates.password = generateStrongPassword();
          }
          if (missing.includes('first_name')) {
            updates.firstName = email.trim().split('@')[0] || 'Member';
          }
          if (missing.includes('last_name')) {
            updates.lastName = '';
          }
          if (missing.includes('username')) {
            const local = email.trim().split('@')[0] || 'member';
            updates.username = `${local}-${Date.now().toString(36)}`;
          }

          if (Object.keys(updates).length > 0) {
            result = await signUp.update(updates);
          } else {
            // Missing something we don't know how to fill — surface it.
            console.warn('[sign-in] unhandled missing fields', missing);
          }
        }

        if (result.status === 'complete') {
          await setSignUpActive?.({ session: result.createdSessionId });
          router.replace('/');
          return;
        }
        console.warn('[sign-in] unexpected signUp status', result.status, result.missingFields);
      }
      setError('Verification incomplete. Try a new code.');
    } catch (e: any) {
      setError(e?.errors?.[0]?.message ?? 'Invalid or expired code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: 'Sign in' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.hero}>
            <View style={styles.iconBubble}>
              <Mail size={28} color="#0b2a6f" />
            </View>
            <ThemedText style={styles.title}>
              {step === 'email' ? 'Sign in to save meetings' : 'Check your email'}
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              {step === 'email'
                ? "Enter your email and we'll send you a one-time code. No password needed."
                : `We sent a code to ${email}. Enter it below to continue.`}
            </ThemedText>
          </View>

          {step === 'email' ? (
            <View style={styles.form}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#98a2b3"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                style={styles.input}
                editable={!busy}
              />
              <Pressable
                style={[styles.primaryButton, !email && styles.primaryButtonDisabled]}
                disabled={!canSubmit || !email}
                onPress={handleSendCode}
              >
                {busy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <ThemedText style={styles.primaryButtonText}>
                      Send code
                    </ThemedText>
                    <ArrowRight size={16} color="#ffffff" />
                  </>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={styles.form}>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="6-digit code"
                placeholderTextColor="#98a2b3"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                style={[styles.input, styles.inputCode]}
                editable={!busy}
                maxLength={6}
              />
              <Pressable
                style={[styles.primaryButton, !code && styles.primaryButtonDisabled]}
                disabled={!canSubmit || !code}
                onPress={handleVerifyCode}
              >
                {busy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <ThemedText style={styles.primaryButtonText}>
                      Verify & continue
                    </ThemedText>
                    <ArrowRight size={16} color="#ffffff" />
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
              >
                <ThemedText style={styles.linkText}>
                  Use a different email
                </ThemedText>
              </Pressable>
            </View>
          )}

          {error ? (
            <ThemedText style={styles.error}>{error}</ThemedText>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f7fb' },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    gap: 24,
  },
  hero: { alignItems: 'center', gap: 12, marginBottom: 16 },
  iconBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(11,42,111,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0b2a6f',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  form: { gap: 12 },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.20)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0b2a6f',
  },
  inputCode: {
    letterSpacing: 4,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 20,
  },
  primaryButton: {
    backgroundColor: '#0b2a6f',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  linkText: {
    textAlign: 'center',
    color: '#0b2a6f',
    fontWeight: '700',
    marginTop: 4,
  },
  error: {
    color: '#b42318',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
});
