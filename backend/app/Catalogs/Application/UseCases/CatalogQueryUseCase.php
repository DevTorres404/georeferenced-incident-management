<?php

namespace App\Catalogs\Application\UseCases;

use App\Catalogs\Domain\Repositories\CatalogRepositoryInterface;

class CatalogQueryUseCase
{
    public function __construct(private CatalogRepositoryInterface $catalogRepository)
    {
    }

    public function overview(): array
    {
        return $this->catalogRepository->overview();
    }

    public function categories()
    {
        return $this->catalogRepository->categories();
    }

    public function subcategories(int $categoriaId)
    {
        return $this->catalogRepository->subcategories($categoriaId);
    }

    public function priorities()
    {
        return $this->catalogRepository->priorities();
    }

    public function states()
    {
        return $this->catalogRepository->states();
    }

    public function transitions(?int $estadoId = null)
    {
        return $this->catalogRepository->transitions($estadoId);
    }

    public function roles()
    {
        return $this->catalogRepository->roles();
    }

    public function permissions()
    {
        return $this->catalogRepository->permissions();
    }
}
