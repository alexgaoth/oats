{
  description = "Oats – privacy-first voice dictation, meeting transcription & notes";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      supportedSystems = [ "x86_64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          oats = pkgs.callPackage ./nix/package.nix { };
        in
        {
          default = oats;
          oats = oats;
        }
      );

      overlays.default = _final: _prev: {
        oats = self.packages.x86_64-linux.oats;
      };

      nixosModules.default = import ./nix/module.nix self;
    };
}
