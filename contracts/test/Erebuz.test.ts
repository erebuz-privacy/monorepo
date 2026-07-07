import { expect } from "chai";
import hre from "hardhat";
import { getChainId } from "@erebuz/sdk";

describe("Erebuz", () => {
  it("sets the deployer as owner", async () => {
    const [deployer] = await hre.ethers.getSigners();
    const Erebuz = await hre.ethers.getContractFactory("Erebuz");
    const erebuz = await Erebuz.deploy();

    expect(await erebuz.owner()).to.equal(deployer.address);
    expect(await erebuz.NAME()).to.equal("Erebuz");
  });

  it("shares chain config with the sdk", () => {
    expect(getChainId("localhost")).to.equal(31337);
  });
});
