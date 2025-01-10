require('dotenv').config();
const { Client, GatewayIntentBits, Events, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const mysql = require("mysql2/promise");
const puppeteer = require('puppeteer');

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

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Completar formulario
async function completarFormulario(link, numero, usuario) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Accede a la página
  await page.goto('https://sirhurt.net/autobuy/teststuff/buyrobux.php', { waitUntil: 'domcontentloaded', timeout: 0 });

  let intentos = 0;
  const maxIntentos = 10;
  let numeroActual = 0;
  let formularioEnviado = false;

  // Intentar hasta que el formulario se envíe correctamente
  while (intentos < maxIntentos && !formularioEnviado) {
    try {
      // Esperamos a que el elemento que contiene el número esté disponible
      await page.waitForSelector('#IntroductionLabelText0', { visible: true, timeout: 5000 });

      // Obtener el valor actual
      numeroActual = await page.$eval('#IntroductionLabelText0', el => parseInt(el.innerText.trim(), 10));

      if (numeroActual >= numero) {
        console.log(`Número actual (${numeroActual}) es suficiente para el pedido: ${numero}.`);

        // Completa los campos del formulario
        await page.type('#keyDesc', currentKey); // Usa la key actual
        await page.type('#username', '@'); // Coloca solo '@' 
        await page.evaluate(() => document.querySelector('#tshirtid0e028').value = ''); // Limpia el campo
        await page.type('#tshirtid0e028', link); // Ingresa el link proporcionado
        await page.type('#redeemamount', String(numero));

        // Espera a que el botón con el texto 'Canjear clave' esté disponible
        await page.waitForSelector('button', { visible: true });

        // Usa $$eval para encontrar el botón por su texto
        await page.$$eval('button', buttons => {
          const button = buttons.find(b => b.textContent.includes('Canjear clave'));
          if (button) {
            button.click(); // Haz clic en el botón
          }
        });

        // Espera a que la página cargue después de enviar
        await page.waitForNavigation({ waitUntil: 'domcontentloaded' });

        // Verificar si el formulario se envió correctamente
        const successMessage = await page.$eval('.success-message-selector', el => el.textContent);
        if (successMessage && successMessage.includes("Formulario enviado exitosamente")) {
          console.log('Formulario enviado exitosamente');
          formularioEnviado = true;
        } else {
          console.log('Error al enviar el formulario. Intentando nuevamente...');
        }
      } else {
        console.log(`Intento ${intentos + 1}: El número actual es ${numeroActual}. Intentando nuevamente...`);
      }
    } catch (error) {
      console.log(`Intento ${intentos + 1}: Error al obtener el número o no está disponible.`);
    }

    intentos++;

    // Espera antes de intentar nuevamente, para no sobrecargar el servidor
    if (!formularioEnviado) {
      await page.waitForTimeout(2000); // Esperar 2 segundos
    }
  }

  // Si después de varios intentos el formulario no se envía, mostramos un mensaje de error
  if (!formularioEnviado) {
    console.error(`Error: No se pudo enviar el formulario en ${maxIntentos} intentos.`);
  } else {
    // Si el formulario fue enviado correctamente, mover el pedido a la lista de entregados
    try {
      await db.query(
        "INSERT INTO cliente_entregados (gamepass, robux, nombre) SELECT gamepass, robux, nombre FROM cliente WHERE gamepass = ? AND robux = ? AND nombre = ?",
        [link, numero, usuario]
      );
      // Eliminar el pedido de la lista de espera
      await db.query("DELETE FROM cliente WHERE gamepass = ? AND robux = ? AND nombre = ?", [link, numero, usuario]);

      console.log(`Pedido para ${usuario} movido a entregados.`);
    } catch (error) {
      console.error("Error al mover el pedido a la lista de entregados:", error);
    }
  }

  await browser.close();
}


// Pedidos
async function procesarPedidos() {
  try {
    // Obtener los 10 primeros pedidos menores a 750
    const [pedidosMenores] = await db.query(
      "SELECT * FROM cliente WHERE robux <= 750 LIMIT 10"
    );

    for (const pedido of pedidosMenores) {
      await completarFormulario(pedido.gamepass, pedido.robux, pedido.nombre);
    }

    // Obtener 5 pedidos mayores a 750
    const [pedidosMayores] = await db.query(
      "SELECT * FROM cliente WHERE robux > 750 LIMIT 5"
    );

    for (const pedido of pedidosMayores) {
      await completarFormulario(pedido.gamepass, pedido.robux, pedido.nombre);
    }
  } catch (error) {
    console.error("Error al procesar los pedidos:", error);
  }
}

// Comando de ingreso
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand() && !interaction.isButton()) return;

  // Manejador para comandos
  if (interaction.isCommand()) {
    if (interaction.commandName === "ingresar") {
      const link = interaction.options.getString("link");
      const numero = interaction.options.getInteger("numero");
      const usuario = interaction.options.getString("usuario");

      try {
        // Guardar en la base de datos
        await db.query(
          "INSERT INTO cliente (gamepass, robux, nombre) VALUES (?, ?, ?)",
          [link, numero, usuario]
        );

        // Responder al usuario
        await interaction.reply(
          `Se ha ingresado el pedido para el cliente **${usuario}** con el número **${numero}** y el link: ${link}.`
        );

        // Procesar los pedidos cada vez que se ingresa uno nuevo
        await procesarPedidos();
      } catch (error) {
        console.error(error);
        await interaction.reply("Hubo un error al ingresar el pedido.");
      }
    }

    if (interaction.commandName === "consultar-key") {
      await interaction.reply(`La key actual es: **${currentKey}**\n¿Deseas cambiar la key? Responde con \`y\` o \`n\`.`);

      const filter = (response) =>
        response.author.id === interaction.user.id &&
        ["y", "n"].includes(response.content.toLowerCase());

      const collector = interaction.channel.createMessageCollector({
        filter,
        time: 15000,
        max: 1,
      });

      collector.on("collect", async (response) => {
        const answer = response.content.toLowerCase();

        if (answer === "y") {
          await interaction.followUp("Por favor, escribe la nueva key que deseas establecer.");

          const keyCollector = interaction.channel.createMessageCollector({
            filter: (keyResponse) => keyResponse.author.id === interaction.user.id,
            time: 15000,
            max: 1,
          });

          keyCollector.on("collect", async (keyResponse) => {
            const newKey = keyResponse.content;
            currentKey = newKey;
            await interaction.followUp(`La key ha sido actualizada a: **${newKey}**`);
          });

          keyCollector.on("end", (collected) => {
            if (collected.size === 0) {
              interaction.followUp("No recibí una nueva key. La operación ha sido cancelada.");
            }
          });
        } else if (answer === "n") {
          await interaction.followUp("No se ha realizado ningún cambio.");
        }
      });

      collector.on("end", (collected) => {
        if (collected.size === 0) {
          interaction.followUp("No recibí respuesta. La operación ha sido cancelada.");
        }
      });
    }

    if (interaction.commandName === "listaespera" || interaction.commandName === "listaentregados") {
      const tabla = interaction.commandName === "listaespera" ? "cliente" : "cliente_entregados";
      const pagina = 1;

      try {
        const [filas] = await db.query(`SELECT * FROM ${tabla} LIMIT 10 OFFSET 0`);

        if (filas.length === 0) {
          await interaction.reply("No hay pedidos en la lista.");
          return;
        }

        const lista = filas
          .map((fila, index) => `**#${index + 1}** - Usuario: ${fila.nombre}, Link: ${fila.gamepass}, Robux: ${fila.robux}`)
          .join("\n");

        const botones = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("prev_page").setLabel("⬅️").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("next_page").setLabel("➡️").setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({
          content: `Página 1:\n${lista}`,
          components: [botones],
        });
      } catch (error) {
        console.error(error);
        await interaction.reply("Hubo un error al obtener la lista de espera.");
      }
    }
  }

  // Manejador para botones
  if (interaction.isButton()) {
    const [tabla, pagina] = interaction.customId.split("_");

    try {
      const offset = (parseInt(pagina, 10) - 1) * 10;
      const [filas] = await db.query(`SELECT * FROM ${tabla} LIMIT 10 OFFSET ?`, [offset]);

      if (filas.length === 0) {
        await interaction.update({ content: "No hay más resultados.", components: [] });
        return;
      }

      const lista = filas
        .map((fila, index) => `**#${index + 1}** - Usuario: ${fila.nombre}, Link: ${fila.gamepass}, Robux: ${fila.robux}`)
        .join("\n");

      const botones = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${tabla}_${Math.max(1, pagina - 1)}`)
          .setLabel("⬅️")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`${tabla}_${pagina + 1}`)
          .setLabel("➡️")
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.update({ content: `Página ${pagina}:\n${lista}`, components: [botones] });
    } catch (error) {
      console.error(error);
      await interaction.reply("Hubo un error al navegar por la lista.");
    }
  }
});

let currentKey = "DEFAULT_KEY_123"; // Variable para almacenar la key actual

// Registrar el comando
const commands = [
  {
    name: "consultar-key",
    description: "Consulta la key actual.",
  },
  {
    name: "ingresar",
    description: "Ingresa un pedido con un link, un número y el nombre del cliente.",
    options: [
      {
        name: "link",
        type: 3, // String
        description: "El link del pedido.",
        required: true,
      },
      {
        name: "numero",
        type: 4, // Integer
        description: "El número asociado al pedido.",
        required: true,
      },
      {
        name: "usuario",
        type: 3, // String
        description: "El nombre de usuario del cliente.",
        required: true,
      },
    ],
  },
  {
    name: "listaespera",
    description: "Muestra la lista de pedidos en espera.",
  },
  {
    name: "listaentregados",
    description: "Muestra la lista de pedidos entregados.",
  }
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("Registrando comandos...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log("¡Comandos registrados con éxito!");
  } catch (error) {
    console.error("Error al registrar el comando 'key':", error);
  }
})();

client.login(TOKEN).catch(error => {
  console.error('Error al iniciar sesión:', error);
});
