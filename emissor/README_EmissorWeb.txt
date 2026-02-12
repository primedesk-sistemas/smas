PrimeDesk — EmissorWeb (SIMPLIFICADO)

Como usar:
1) Suba a pasta EmissorWeb inteira para sua hospedagem (site simples).
2) Abra o site e digite a senha.
   - Senha padrão: PRIMEDESK123
   - Para trocar: edite EmissorWeb/config.json (campo "password") e envie pro host.
3) Cole a KEY/HWID do cliente e clique em "Gerar licença".
4) Envie o arquivo .lic ao cliente e coloque em:
   SMAS\config\license\

Histórico:
- Fica salvo no navegador.
- Use Exportar para backup (gera um .json).
- Em outro PC/navegador, use Importar para restaurar.

IMPORTANTE (assinatura):
- Este emissor usa HMAC-SHA256 (segredo simples).
- O segredo fica em EmissorWeb/config.json (campo "secret").
- Se você trocar o segredo, tem que trocar também em:
  SMAS\service\VerifyLicense.ps1 (variável $secret).


Arquivos de chave (já inclusos neste pacote):
- primdesk_rsa_private.xml (necessário para assinar no emissor)
- primdesk_rsa_public.xml  (opcional no emissor; necessário no cliente para validar)

Importante:
- Para o emissor funcionar, mantenha primdesk_rsa_private.xml dentro da pasta EmissorWeb no host.
- No cliente, o arquivo primdesk_rsa_public.xml já está em SMAS\service e a validação é RSA/SHA-256.
