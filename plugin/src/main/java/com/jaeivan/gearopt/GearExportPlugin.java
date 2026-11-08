package com.jaeivan.gearopt;

import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import javax.inject.Inject;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.Client;
import net.runelite.api.GameState;
import net.runelite.api.Item;
import net.runelite.api.ItemComposition;
import net.runelite.api.ItemContainer;
import net.runelite.api.Player;
import net.runelite.api.Skill;
import net.runelite.api.events.GameStateChanged;
import net.runelite.api.events.ItemContainerChanged;
import net.runelite.api.events.StatChanged;
import net.runelite.api.gameval.InventoryID;
import net.runelite.client.RuneLite;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.game.ItemManager;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;

/**
 * Exports the data the gear optimizer needs to ~/.runelite/gear-optimizer/&lt;account&gt;.json.
 * Nothing leaves your machine: the optimizer's local dev server reads this file.
 * The bank is remembered between sessions; open your bank once after logging in to refresh it.
 */
@Slf4j
@PluginDescriptor(
	name = "Gear Optimizer Export",
	description = "Writes bank, worn gear, inventory and levels to a local file for the gear optimizer",
	tags = {"gear", "bank", "dps", "export"}
)
public class GearExportPlugin extends Plugin
{
	static final Path EXPORT_DIR = RuneLite.RUNELITE_DIR.toPath().resolve("gear-optimizer");
	private static final int NO_PLACEHOLDER = -1;
	private static final long WRITE_DEBOUNCE_MS = 1500;

	private static final Map<Skill, String> SKILL_KEYS = new EnumMap<>(Skill.class);

	static
	{
		SKILL_KEYS.put(Skill.ATTACK, "atk");
		SKILL_KEYS.put(Skill.STRENGTH, "str");
		SKILL_KEYS.put(Skill.DEFENCE, "def");
		SKILL_KEYS.put(Skill.RANGED, "ranged");
		SKILL_KEYS.put(Skill.MAGIC, "magic");
		SKILL_KEYS.put(Skill.PRAYER, "prayer");
		SKILL_KEYS.put(Skill.HITPOINTS, "hp");
		SKILL_KEYS.put(Skill.MINING, "mining");
		SKILL_KEYS.put(Skill.HERBLORE, "herblore");
		SKILL_KEYS.put(Skill.FARMING, "farming");
	}

	@Inject
	private Client client;

	@Inject
	private ClientThread clientThread;

	@Inject
	private ItemManager itemManager;

	@Inject
	private ScheduledExecutorService executor;

	@Inject
	private Gson gson;

	private ExportState state;
	private ScheduledFuture<?> pendingWrite;

	@Override
	protected void startUp()
	{
		state = null;
		if (client.getGameState() == GameState.LOGGED_IN)
		{
			clientThread.invokeLater((BooleanSupplier) this::onLoggedIn); // returns false until the account hash is ready → retried next tick
		}
	}

	@Override
	protected void shutDown()
	{
		flushNow();
		state = null;
	}

	@Subscribe
	public void onGameStateChanged(GameStateChanged event)
	{
		if (event.getGameState() == GameState.LOGGED_IN)
		{
			// LOGGED_IN also fires after every loading screen; only (re)load when the account changes
			clientThread.invokeLater((BooleanSupplier) this::onLoggedIn); // returns false until the account hash is ready → retried next tick
		}
		else if (event.getGameState() == GameState.LOGIN_SCREEN)
		{
			flushNow();
			state = null;
		}
	}

	/** Load the saved export for this account (keeps the bank from earlier sessions), then refresh what's visible now. */
	private boolean onLoggedIn()
	{
		long hash = client.getAccountHash();
		if (hash == -1)
		{
			return false; // not ready yet; invokeLater retries
		}
		String account = Long.toString(hash);
		if (state == null || !account.equals(state.account))
		{
			flushNow();
			state = load(hash);
			state.account = account;
		}
		readSkills();
		readContainer(InventoryID.WORN);
		readContainer(InventoryID.INV);
		readContainer(InventoryID.BANK); // only present if the bank is open
		scheduleWrite();
		return true;
	}

	@Subscribe
	public void onItemContainerChanged(ItemContainerChanged event)
	{
		int id = event.getContainerId();
		if (state != null && (id == InventoryID.BANK || id == InventoryID.INV || id == InventoryID.WORN))
		{
			readContainer(id);
			scheduleWrite();
		}
	}

	@Subscribe
	public void onStatChanged(StatChanged event)
	{
		if (state != null && SKILL_KEYS.containsKey(event.getSkill()))
		{
			readSkills();
			scheduleWrite();
		}
	}

	private void readSkills()
	{
		for (Map.Entry<Skill, String> e : SKILL_KEYS.entrySet())
		{
			state.skills.put(e.getValue(), client.getRealSkillLevel(e.getKey()));
		}
		Player p = client.getLocalPlayer();
		if (p != null && p.getName() != null)
		{
			state.rsn = p.getName();
		}
	}

	private void readContainer(int containerId)
	{
		ItemContainer container = client.getItemContainer(containerId);
		if (container == null)
		{
			return;
		}
		TreeSet<Integer> ids = new TreeSet<>();
		for (Item item : container.getItems())
		{
			if (item.getId() == -1 || item.getQuantity() <= 0)
			{
				continue;
			}
			if (containerId == InventoryID.BANK)
			{
				ItemComposition comp = itemManager.getItemComposition(item.getId());
				if (comp.getPlaceholderTemplateId() != NO_PLACEHOLDER)
				{
					continue;
				}
			}
			ids.add(itemManager.canonicalize(item.getId())); // un-notes, maps placeholders/variants
		}
		List<Integer> list = new ArrayList<>(ids);
		long now = System.currentTimeMillis();
		if (containerId == InventoryID.BANK)
		{
			state.bank = list;
			state.bankUpdatedAt = now;
		}
		else if (containerId == InventoryID.WORN)
		{
			state.worn = list;
		}
		else
		{
			state.inventory = list;
		}
		state.updatedAt = now;
	}

	private void scheduleWrite()
	{
		if (pendingWrite != null)
		{
			pendingWrite.cancel(false);
		}
		final String json = gson.toJson(state); // serialize on the client thread, write off it
		final String account = state.account;
		pendingWrite = executor.schedule(() -> write(account, json), WRITE_DEBOUNCE_MS, TimeUnit.MILLISECONDS);
	}

	private void flushNow()
	{
		if (state == null || state.account == null)
		{
			return;
		}
		if (pendingWrite != null)
		{
			pendingWrite.cancel(false);
		}
		write(state.account, gson.toJson(state));
	}

	private static void write(String account, String json)
	{
		try
		{
			Files.createDirectories(EXPORT_DIR);
			Path target = EXPORT_DIR.resolve(account + ".json");
			Path tmp = EXPORT_DIR.resolve(account + ".json.tmp");
			Files.write(tmp, json.getBytes(StandardCharsets.UTF_8));
			Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		}
		catch (IOException e)
		{
			log.warn("Gear optimizer export failed", e);
		}
	}

	private ExportState load(long hash)
	{
		Path file = EXPORT_DIR.resolve(hash + ".json");
		if (Files.exists(file))
		{
			try
			{
				ExportState s = gson.fromJson(new String(Files.readAllBytes(file), StandardCharsets.UTF_8), ExportState.class);
				if (s != null)
				{
					return s.normalized();
				}
			}
			catch (IOException | JsonSyntaxException e)
			{
				log.warn("Could not read previous gear optimizer export; starting fresh", e);
			}
		}
		return new ExportState().normalized();
	}
}
