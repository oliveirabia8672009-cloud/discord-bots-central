export const DESCRICAO_ANZY = 'Adquira seu bot personalizável com Anzy Programs!\nEntre no nosso servidor: https://discord.gg/Ny2v6wUpJ';

type Aplicacao = {
  description: string | null;
  fetch(): Promise<unknown>;
  edit(options: { description: string }): Promise<unknown>;
};

// Executado por cada bot que utiliza esta base ao conectar ao Discord.
export async function aplicarDescricaoAnzy(aplicacao: Aplicacao): Promise<void> {
  await aplicacao.fetch();
  if (aplicacao.description !== DESCRICAO_ANZY) {
    await aplicacao.edit({ description: DESCRICAO_ANZY });
  }
}
