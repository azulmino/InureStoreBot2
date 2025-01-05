require('dotenv').config();
const { Client, GatewayIntentBits, Events, REST, Routes } = require("discord.js");

// Registrar las variables de entorno para verificar si se cargaron correctamente
console.log('DISCORD_TOKEN:', process.env.DISCORD_TOKEN);
console.log('CLIENT_ID:', process.env.CLIENT_ID);
console.log('GUILD_ID:', process.env.GUILD_ID);

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const robuxEmoji = '<:Robux:1232850995235520615>';

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Faltan variables de entorno requeridas. Por favor, verifica tu archivo .env.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ]
});

let currentKey = "DEFAULT_KEY_123"; // Variable para almacenar la key actual

const commands = [
  {
    name: "key",
    description: "Consulta o actualiza la key actual",
    options: [
      {
        name: "accion",
        type: 3, // String
        description: "Acción a realizar: consultar o actualizar",
        required: true,
        choices: [
          { name: "Consultar", value: "consultar" },
          { name: "Actualizar", value: "actualizar" },
        ],
      },
      {
        name: "nueva_key",
        type: 3, // String
        description: "Nueva key (solo si la acción es actualizar)",
        required: false,
      },
    ],
  },
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("Registrando comandos...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log("¡Comando 'key' registrado con éxito!");
  } catch (error) {
    console.error("Error al registrar el comando 'key':", error);
  }
})();

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === "key") {
    const accion = interaction.options.getString("accion");
    const nuevaKey = interaction.options.getString("nueva_key");

    if (accion === "consultar") {
      await interaction.reply(`La key actual es: "${currentKey}".`);
    } else if (accion === "actualizar") {
      if (!nuevaKey) {
        return await interaction.reply("Debes proporcionar una nueva key para actualizar.");
      }

      currentKey = nuevaKey;
      await interaction.reply(`La key ha sido actualizada a: "${currentKey}".`);
    }
  }
});